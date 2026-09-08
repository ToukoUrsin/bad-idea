// Quiet, synthesized foley. No network assets, and no sound before a player gesture.
export class GameAudio {
 context:AudioContext|null=null;enabled=true;distance=0;
 unlock(){if(!this.context)this.context=new AudioContext();void this.context.resume();}
 tone(frequency:number,duration:number,volume:number,end=frequency){
  if(!this.enabled||!this.context||this.context.state!=='running')return;
  const c=this.context,t=c.currentTime,o=c.createOscillator(),g=c.createGain();
  o.type='sine';o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(end,t+duration);
  g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(volume,t+.006);g.gain.exponentialRampToValueAtTime(.001,t+duration);
  o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+duration);
 }
 step(){this.tone(105,.065,.045,45);}
 land(){this.tone(85,.12,.08,30);}
 use(){this.tone(260,.16,.055,620);}
 tick(speed:number,grounded:boolean,dt:number){if(!grounded||speed<.3){this.distance=0;return;}this.distance+=speed*dt;if(this.distance>1.45){this.distance=0;this.step();}}
}
