/** Constant-size liveness payload; model/workspace/status serialization must not gate watchdog signals. */
export function livenessBeat(previousTick:number,now:number,rssBytes:number) {
  return {type:'heartbeat',at:now,eventLoopLagMs:Math.max(0,now-previousTick-5000),rssBytes};
}
