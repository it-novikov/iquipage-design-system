export const TAG_NAME_LIMIT=32;
const graphemes=new Intl.Segmenter('ru',{granularity:'grapheme'});
export const tagNameLength=(value:string)=>[...graphemes.segment(value)].length;
