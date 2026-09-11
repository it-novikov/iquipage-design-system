/** Frontend command lifecycle. No retries of an unknown effect without a receipt. */
export class PlanningOperation {
  state='idle'; preview=null; result=null; error='';
  constructor(adapter,projectId,onChange=()=>{},keyFactory=()=>crypto.randomUUID()) {this.adapter=adapter;this.projectId=projectId;this.onChange=onChange;this.keyFactory=keyFactory;this.generation=0;this.disposed=false;}
  emit(){if(!this.disposed)this.onChange(this);}
  async inspect(intent) {
    if(this.disposed || ['submitting','uncertain','checking'].includes(this.state))return;
    this.abort?.abort();this.abort=new AbortController();const generation=++this.generation;
    this.state='loading';this.preview=null;this.error='';this.key=null;this.intent=structuredClone(intent);this.emit();
    try {
      const preview=await this.adapter.preview({projectId:this.projectId,intent:this.intent,signal:this.abort.signal});
      if(this.disposed || generation!==this.generation)return;
      if(!preview || typeof preview.token!=='string' || !Array.isArray(preview.changes) || !Array.isArray(preview.blockers) || !Number.isFinite(Date.parse(preview.expiresAt)))throw Error('Не удалось прочитать последствия операции.');
      this.preview=preview;this.state='ready';
    }catch(error){if(generation===this.generation&&!this.abort.signal.aborted){this.error=error.message;this.state='failed';}}
    this.emit();
  }
  async submit() {
    if(this.disposed || this.state!=='ready' || this.preview.blockers.length)return;
    if(Date.parse(this.preview.expiresAt)<=Date.now()){this.state='stale';this.error='Подтверждение устарело. Проверьте состав снова.';this.emit();return;}
    this.key ||= this.keyFactory();this.state='submitting';this.error='';this.emit();
    try {await this.accept(await this.adapter.commit({projectId:this.projectId,token:this.preview.token,idempotencyKey:this.key}));}
    catch(error){this.error=error.message||'Ответ не получен.';this.state=error.definitive===true?'failed':'uncertain';}
    this.emit();
  }
  async recover() {
    if(this.disposed || this.state!=='uncertain' || !this.key)return;
    this.state='checking';this.emit();
    try {await this.accept(await this.adapter.receipt({projectId:this.projectId,idempotencyKey:this.key}));}
    catch(error){this.error=error.message||'Результат пока неизвестен.';this.state='uncertain';}
    this.emit();
  }
  async accept(result) {
    if(this.disposed)return;
    if(result?.state==='committed'){this.result=result;this.state='committed';}
    else if(result?.state==='rejected'){this.error=result.message||'Изменение не сохранено.';this.state='failed';}
    else {this.error='Результат ещё не подтверждён. Проверьте его перед следующим действием.';this.state='uncertain';}
  }
  canClose(){return !['submitting','checking','uncertain'].includes(this.state);}
  destroy(){this.disposed=true;this.generation++;this.abort?.abort();}
}
