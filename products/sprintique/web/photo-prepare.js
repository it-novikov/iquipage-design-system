/** What the DS cropper opens as it is: PNG, JPEG or WebP up to 10 MB and 40 megapixels. */
const CROPPER_TYPES=['image/png','image/jpeg','image/webp'];
const CROPPER_BYTES=10*1024*1024,CROPPER_PIXELS=40_000_000,MIN_SIDE=32;
/** A converted photo keeps this many pixels on its longer side: the crop exports 512 px, the rest leaves room to zoom. */
const PREPARED_SIDE=2048;
const HEIC_NAME=/\.(heic|heif)$/i,HEIC_TYPE=/^image\/hei[cf]/i;

/** Decodes with the browser's own image pipeline, which applies EXIF orientation and reads HEIC where the platform
 *  can (Safari). `release` frees the object URL once the pixels are drawn. */
async function decodeImage(file){
  const url=URL.createObjectURL(file),image=new Image();image.decoding='async';image.src=url;
  try{await image.decode();}catch(error){URL.revokeObjectURL(url);throw error;}
  return {image,width:image.naturalWidth,height:image.naturalHeight,release:()=>URL.revokeObjectURL(url)};
}
const canvasOf=({width,height})=>Object.assign(document.createElement('canvas'),{width,height});
const blobOf=(canvas,type,quality)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Не удалось подготовить фото. Выберите другое.')),type,quality));

/**
 * A photo the cropper can open. Ordinary phone and camera pictures often exceed what it takes (a HEIC from an
 * iPhone, a 48-megapixel or 15 MB JPEG, a GIF): the browser reads them, and a JPEG (or a PNG, for pictures that may be
 * transparent) of at most 2048 px replaces them. A file the browser cannot read gets a message that says what to do.
 */
export async function preparePhoto(file,{decode=decodeImage,canvas=canvasOf,encode=blobOf}={}){
  const heic=HEIC_NAME.test(file.name||'')||HEIC_TYPE.test(file.type||'');
  let decoded;
  try{decoded=await decode(file);}
  catch{throw Error(heic?'Этот браузер не открывает фото HEIC. Сохраните его как JPEG или выберите в Safari.':'Не удалось открыть файл как изображение. Выберите фото JPEG, PNG или WebP.');}
  try{
    const {image,width,height}=decoded;
    if(!(width>0&&height>0))throw Error('Не удалось открыть файл как изображение. Выберите фото JPEG, PNG или WebP.');
    if(Math.min(width,height)<MIN_SIDE)throw Error('Фото должно быть не меньше 32 px по короткой стороне.');
    if(CROPPER_TYPES.includes(file.type)&&file.size<=CROPPER_BYTES&&width*height<=CROPPER_PIXELS)return file;
    const scale=Math.min(1,PREPARED_SIDE/Math.max(width,height));
    const target=canvas({width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))});
    const context=target.getContext('2d');
    const draw=opaque=>{
      context.clearRect(0,0,target.width,target.height);
      if(opaque){context.fillStyle='#fff';context.fillRect(0,0,target.width,target.height);}
      context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(image,0,0,target.width,target.height);
    };
    // A camera photo has no transparency; anything else stays PNG unless that is too large to send.
    const photo=file.type==='image/jpeg'||heic;
    draw(photo);let blob=await encode(target,photo?'image/jpeg':'image/png',.92);
    if(!photo&&blob.size>CROPPER_BYTES){draw(true);blob=await encode(target,'image/jpeg',.92);}
    const name=String(file.name||'').replace(/\.[^.]*$/,'')||'photo';
    return new File([blob],name+(blob.type==='image/png'?'.png':'.jpg'),{type:blob.type});
  }finally{decoded.release?.();}
}
