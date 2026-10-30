import {policySignature} from './destinations.js';

// A slow rules request must never replace edits made after it started.
export function preserveDraftOnRefresh(started, current, savedBefore){
 if(!started||!current||!savedBefore)return false;
 return policySignature(started)!==policySignature(savedBefore)||policySignature(current)!==policySignature(started);
}

export function dateFilterLabel(policy){
 const range=`${policy.depart_start||'未选择开始日期'} 至 ${policy.depart_end||'未选择结束日期'}`;
 return `${range} 出发${policy.mode==='round'?` · 停留 ${policy.min_stay}–${policy.max_stay} 天`:''}`;
}

export function beyondSnapshotCoverage(policy,snapshot){
 return Boolean(snapshot.coverage_end&&policy.depart_end>snapshot.coverage_end);
}
