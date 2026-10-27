// Trusted planning metadata only: no mounts, system changes, project execution or Linux simulation.
import assert from 'node:assert/strict';
import {runnerStoragePlan,assertStoragePlanCurrent} from '../../scripts/lib/runner-storage-plan.mjs';
import {runnerSetupPlan} from '../../scripts/lib/runner-setup-plan.mjs';
import {storageOwnerPolicy} from '../../scripts/lib/storage-owner-policy.mjs';
const GiB=1024**3,policy=storageOwnerPolicy(),id=policy.protectedDiskIdentities[0];
assert.ok(id);
const report={schemaVersion:2,readOnly:true,at:new Date().toISOString(),limitations:[],partitions:[],volumes:[],disks:[{Number:1,BusType:'SATA',Size:931*GiB,NumberOfPartitions:0,LargestFreeExtent:930*GiB,FriendlyName:'Trusted fixture',PartitionStyle:'MBR',IdentitySha256:id,IsBoot:false,IsSystem:false,IsOffline:false,IsReadOnly:false,HealthStatus:'Healthy'}]};
const held=runnerStoragePlan(report,policy);assert.equal(held.plan.recommendation,null);assert.equal(held.plan.ownerProtectedDisks.length,1);assert.equal(held.plan.unallocatedCandidates.length,0);
assert.equal(assertStoragePlanCurrent(held.plan,held.digest,report,policy).partitioningAuthorized,false);
const unheld={protectedDiskIdentities:[],preferredPartitionBytes:null};const proposed=runnerStoragePlan(report,unheld);assert.equal(proposed.plan.recommendation.proposedPartitionBytes,930*GiB);assert.equal(proposed.plan.partitioningAuthorized,false);
assert.throws(()=>assertStoragePlanCurrent(proposed.plan,proposed.digest,report,policy),/changed/);
const env={schemaVersion:2,readOnly:true,at:report.at,storage:{fixedVolumes:[{DeviceID:'R:',FreeSpace:100*GiB}],volumeMappings:[],physicalDisks:[]},hardware:{totalMemoryBytes:24*GiB,processors:[]},operatingSystem:{freeMemoryBytes:8*GiB}};
assert.equal(runnerSetupPlan(env,undefined,policy).eligibleVolumes.length,0);assert.equal(runnerSetupPlan(env,report,policy).eligibleVolumes.length,0);
assert.throws(()=>runnerStoragePlan(report,{protectedDiskIdentities:['invalid'],preferredPartitionBytes:null}),/policy/);
console.log(JSON.stringify({passed:true,checks:['owner HDD hold excludes candidate','hold invalidates prior plan','capacity over 100 GiB can be proposed without authorizing writes','missing detailed mapping fails closed'],systemChanged:false,realIsolationTested:false}));
