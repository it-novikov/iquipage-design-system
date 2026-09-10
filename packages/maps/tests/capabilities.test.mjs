import test from 'node:test';
import assert from 'node:assert/strict';
import {CREATABLE_BOARD_OBJECT_TYPES,normalizeUiCapabilities,assertDocumentTypesAllowed} from '../src/capabilities.js';
import {createMap,remapDocument} from '../src/model.js';
import {proposalDocument} from '../src/agent.js';

test('UI capabilities default to the complete Maps surface and clone create types',()=>{
  const capabilities=normalizeUiCapabilities();
  assert.deepEqual(capabilities.allowedCreateTypes,CREATABLE_BOARD_OBJECT_TYPES);
  for(const name of ['mapSwitcher','templates','sessions','workflow','automation','agentProposals'])assert.equal(capabilities[name],true);
  const input=['sticky','task','sticky'];const restricted=normalizeUiCapabilities({workflow:false,allowedCreateTypes:input});input.pop();
  assert.deepEqual(restricted.allowedCreateTypes,['sticky','task']);assert.equal(restricted.workflow,false);assert.equal(restricted.templates,true);
});

test('UI capabilities reject malformed flags and non-creatable document types',()=>{
  assert.throws(()=>normalizeUiCapabilities({templates:'yes'}),{code:'UI_CAPABILITIES'});
  assert.throws(()=>normalizeUiCapabilities({allowedCreateTypes:['drawing']}),{code:'UI_CAPABILITIES'});
  const capabilities=normalizeUiCapabilities({allowedCreateTypes:['sticky']});
  assert.throws(()=>assertDocumentTypesAllowed({objects:[{type:'task'}]},capabilities),{code:'CREATE_TYPE_DISABLED'});
  assert.equal(assertDocumentTypesAllowed({objects:[{type:'sticky'}]},capabilities).objects[0].type,'sticky');
});

test('external task references are removed from copied documents and cannot be edited by an agent',()=>{
  const map=createMap({projectId:'project',title:'External task'});
  map.document.objects.push({id:'map-task',type:'task',externalTaskId:'task-42',text:'Server title',owner:'Team',done:false,x:10,y:20,width:248,height:144});
  const copied=remapDocument(map.document,{clearPersonal:true});
  assert.equal(copied.objects[0].externalTaskId,undefined);assert.equal(copied.objects[0].owner,undefined);
  assert.throws(()=>proposalDocument(map,{schema:'iquipage.map-proposal/1',mapId:map.id,projectId:map.projectId,baseRevision:map.revision,operations:[{type:'updateText',id:'map-task',text:'Changed'}]},{canEdit:true}),{code:'EXTERNAL_TASK'});
});
