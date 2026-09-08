import {validateCode} from './code-validation';
self.onmessage=async(event)=>{const {invention,level}=event.data;try{self.postMessage(await validateCode(invention,level));}catch(e){self.postMessage({ok:false,error:e instanceof Error?e.message:String(e),checks:[],frames:0});}};
