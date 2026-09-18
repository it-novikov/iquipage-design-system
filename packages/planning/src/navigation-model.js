/** Validate a confirmed host projection; never infer tenant rights from its labels. */
export function readProjectContext(value) {
  const valid=value!==null&&typeof value==='object'&&!Array.isArray(value)
    &&['id','workspaceName','projectName'].every(key=>
      typeof value[key]==='string'&&value[key].trim().length>0&&value[key].length<=240);
  if(!valid)throw Error('Не получен подтверждённый контекст проекта. Текущий проект не изменён.');
  return Object.freeze({id:value.id,workspaceName:value.workspaceName,projectName:value.projectName});
}
