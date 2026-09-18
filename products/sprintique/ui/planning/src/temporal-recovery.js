/** A command receipt and a local controlled preview have independent lifecycles. */
export function createTemporalRecovery({detail,load,canonical,reset,onChanged=()=>{},onFailure=()=>{},isActive=()=>true}){
  let committed=false,settled=false;
  return {
    async committed(){
      committed=true;
      if(await load()){
        if(!isActive())return;
        detail.accept(canonical());settled=true;await onChanged();return;
      }
      detail.reject('Изменение сохранено. Нужно обновить отображение.');settled=true;
      if(isActive()){reset();onFailure();}
      throw Error('Изменение сохранено, но свежий план пока недоступен.');
    },
    close(){
      if(!isActive()||settled)return;
      detail.reject(committed?'Изменение сохранено; обновите план.':'Применение отменено.');
      settled=true;reset();
    }
  };
}
