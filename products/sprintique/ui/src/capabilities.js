import {requireValue} from './common.js';

export const CREATABLE_BOARD_OBJECT_TYPES=Object.freeze(['sticky','text','task','shape','frame','image']);
const BOOLEAN_CAPABILITIES=['mapSwitcher','templates','sessions','workflow','automation','agentProposals'];

/** Host-owned UI surface contract. Server permissions and connections stay in their own contracts. */
export function normalizeUiCapabilities(value={}) {
  requireValue(value&&typeof value==='object'&&!Array.isArray(value),'UI_CAPABILITIES','uiCapabilities должен быть объектом.');
  for(const name of BOOLEAN_CAPABILITIES)requireValue(value[name]===undefined||typeof value[name]==='boolean','UI_CAPABILITIES',`${name} должен быть boolean.`);
  const input=value.allowedCreateTypes??CREATABLE_BOARD_OBJECT_TYPES;
  requireValue(Array.isArray(input)&&input.every(type=>CREATABLE_BOARD_OBJECT_TYPES.includes(type)),'UI_CAPABILITIES','Неизвестный тип создаваемого объекта.');
  return Object.freeze({
    mapSwitcher:true,templates:true,sessions:true,workflow:true,automation:true,agentProposals:true,
    ...Object.fromEntries(BOOLEAN_CAPABILITIES.map(name=>[name,value[name]??true])),
    allowedCreateTypes:Object.freeze([...new Set(input)])
  });
}

export function assertDocumentTypesAllowed(document,uiCapabilities,message='Эта операция создаёт недоступный тип объекта.') {
  const allowed=new Set(uiCapabilities.allowedCreateTypes);
  requireValue(document?.objects?.every(object=>allowed.has(object.type)),'CREATE_TYPE_DISABLED',message);
  return document;
}
