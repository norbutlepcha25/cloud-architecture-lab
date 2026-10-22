import test from 'node:test';
import assert from 'node:assert/strict';
import { runConformanceCases } from '../harness.ts';
import { SERVICE_OPERATIONS, operationSample } from '../../../src/engine/serviceOperations/definitions.ts';
import { runLiveSimulation } from '../../../src/engine/simulation/liveSimulation.ts';
import { runLabReference } from '../../../src/engine/labs/runLabReference.ts';
import { buildRole } from '../../../src/engine/iam/roleBuilder.ts';
import { checkConnection } from '../../../src/engine/architecture/connectionContracts.ts';
const svc = (id: string,serviceId:string): any => ({ id,type:'serviceNode',position:{x:2000,y:0},data:{serviceId,label:id,health:'healthy',subnet:'global',customConfig:{}} });
export function fixture(id:string) {
  const d=SERVICE_OPERATIONS[id], source=svc('caller','lambda'), target=svc('target',id);
  target.data.customConfig.operationLab=operationSample(id);
  target.data.customConfig.resourceArn = id==='cloudwatch' ? '*' : id==='acm' ? d.resource.CertificateArn : `arn:aws:${id==='eventbridge'?'events':id==='secrets_manager'?'secretsmanager':id}:us-east-1:000000000000:${id==='kms'?'key/':''}target`;
  if(d.iam) source.data.iamRole=buildRole('lambda','caller-role',[{target,actions:d.actions}]);
  const nodes=[source,target];
  if(!d.iam) {
    const box=(id:string,boundaryType:string,x:number,y:number,w:number,h:number,cidr:string):any=>({id,type:'boundaryNode',position:{x,y},width:w,height:h,data:{boundaryType,label:id,cidr}});
    nodes.push(box('vpc','vpc',0,1000,1400,650,'10.0.0.0/16'),box('subnet','private_subnet',20,1050,1300,500,'10.0.1.0/24'));
    source.position={x:100,y:1150}; target.position={x:700,y:1150};
    source.width=target.width=100; source.height=target.height=90;
    source.data.subnet=target.data.subnet='private';
    source.data.networkIdentity={privateIp:'10.0.1.10'}; target.data.networkIdentity={privateIp:'10.0.1.20'};
  }
  const edges:any[]=[{id:'call',source:source.id,target:target.id,data:{protocol:d.protocol,relationship:'request'}}];
  const scenario:any={id:`op-${id}`,name:id,startNodeId:'target',method:'POST',path:'/',trafficLevel:'normal'};
  return {source,target,nodes,edges,scenario};
}
const run=(g:ReturnType<typeof fixture>,start='target')=>runLiveSimulation(g.nodes,g.edges,{...g.scenario,startNodeId:start});
const response=(r:any)=>r.steps.findLast((s:any)=>s.details?.operationResponse)?.details.operationResponse;
for(const [id,d] of Object.entries(SERVICE_OPERATIONS)) {
  runConformanceCases([{id:`OP-${id.toUpperCase()}-SUCCESS-001`,awsBehavior:`Bounded ${d.actions[0]} operation: ${d.scope}`,reference:d.source,scenario:`Connected caller executes ${d.name} with authored resource/request`,configuration:operationSample(id) as any,request:{action:d.actions[0]},expected:200,run:()=>run(fixture(id)).statusCode,explain:a=>String(a)}]);
  test(`${id}: real connections, live/lab equivalence, reorder/persistence, failure and recovery`,()=>{
    const g=fixture(id),before=structuredClone(g);
    assert.equal(checkConnection(g.source,g.target,g.edges[0].data).status,'valid');
    const expected=run(g); assert.equal(expected.success,true,expected.summary); assert.ok(response(expected));
    const traversed=run(g,'caller'); assert.equal(traversed.success,true,traversed.summary); assert.deepEqual(response(traversed),response(expected));
    assert.deepEqual(runLabReference({...g,scenario:g.scenario} as any),expected);
    assert.deepEqual(runLiveSimulation([...g.nodes].reverse(),[...g.edges].reverse(),g.scenario),expected);
    assert.deepEqual(runLiveSimulation(JSON.parse(JSON.stringify(g.nodes)),g.edges,g.scenario),expected);
    assert.deepEqual(g,before);
    g.target.data.health='failed'; assert.equal(run(g).statusCode,503); g.target.data.health='healthy'; assert.equal(run(g).statusCode,200);
    g.edges[0].data={...g.edges[0].data,relationship:'manages',referenceAnnotation:'lab'}; assert.equal(run(g).statusCode,400);
  });
  test(`${id}: missing caller/configuration and applicable IAM denial have distinct causes`,()=>{
    const g=fixture(id);
    g.target.data.customConfig.operationLab={}; assert.equal(run(g).statusCode,400);
    g.target.data.customConfig.operationLab=operationSample(id);
    const missing=runLiveSimulation(g.nodes,[],g.scenario); assert.equal(missing.statusCode,400);
    if(d.iam){delete g.source.data.iamRole; const denied=run(g);assert.equal(denied.statusCode,403);assert.match(denied.summary,/role|permission/i);}
    else {g.edges[0].data.destinationPort=1;assert.equal(run(g).statusCode,400);}
  });
}

test('DynamoDB PutItem replaces by primary key and strongly consistent GetItem returns item or absent Item',()=>{
  const g=fixture('dynamodb'); const put=run(g); g.target.data.customConfig.serviceRuntime=put.serviceStates?.target;
  g.target.data.customConfig.operationLab.action='dynamodb:GetItem';
  assert.equal(response(run(g)).Item.id.S,'order-1');
  g.target.data.customConfig.operationLab.request.Key.id.S='missing'; assert.deepEqual(response(run(g)),{});
});
test('ElastiCache SET/GET persists a string and misses return null',()=>{
  const g=fixture('elasticache');g.target.data.customConfig.serviceRuntime=run(g).serviceStates?.target;g.target.data.customConfig.operationLab.action='GET';assert.equal(response(run(g)).value,'cached result');g.target.data.customConfig.operationLab.request.key='missing';assert.equal(response(run(g)).value,null);
});
test('EventBridge reports partial-entry errors while keeping HTTP 200, without delivering targets',()=>{
  const g=fixture('eventbridge');g.target.data.customConfig.operationLab.request.Entries.push({Source:'missing-fields'});const r=run(g);assert.equal(r.statusCode,200);assert.equal(response(r).FailedEntryCount,1);assert.equal(r.serviceStates?.target.records.length,1);
});
test('Kinesis record validation and sequence append are bounded and deterministic',()=>{
  const g=fixture('kinesis');const first=run(g);g.target.data.customConfig.serviceRuntime=first.serviceStates?.target;assert.equal(response(run(g)).SequenceNumber,'2');g.target.data.customConfig.operationLab.request.PartitionKey='';assert.equal(run(g).statusCode,400);
});
test('KMS requires a key policy, and DescribeKey reports Disabled without claiming decryption',()=>{
  const g=fixture('kms');g.target.data.customConfig.operationLab.resource.KeyState='Disabled';assert.equal(response(run(g)).KeyMetadata.KeyState,'Disabled');delete g.target.data.customConfig.operationLab.resource.keyPolicy;assert.equal(run(g).statusCode,403);
});
test('Secrets Manager selects AWSCURRENT by default and requires a matching explicit id/stage',()=>{
  const g=fixture('secrets_manager');assert.equal(response(run(g)).SecretString,'synthetic-training-value');g.target.data.customConfig.operationLab.request.VersionStage='AWSPREVIOUS';assert.equal(run(g).statusCode,400);
});
test('ACM description does not turn pending validation into an issued certificate',()=>{
  assert.equal(response(run(fixture('acm'))).Certificate.Status,'PENDING_VALIDATION');
});
test('SNS, CloudWatch and database invalid request/resource values fail at their own service rule',()=>{
  const sns=fixture('sns');sns.target.data.customConfig.operationLab.request.Message='é'.repeat(140000);assert.equal(run(sns).statusCode,400);
  const cw=fixture('cloudwatch');cw.target.data.customConfig.operationLab.request.MetricData[0].Value=Infinity;assert.equal(run(cw).statusCode,400);
  const db=fixture('redshift');db.target.data.customConfig.operationLab.resource.status='paused';assert.equal(run(db).statusCode,503);
});
