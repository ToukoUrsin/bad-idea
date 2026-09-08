import {parse} from 'acorn';
import {generate} from 'astring';

// Instrument authored loops and callbacks so accidental recursion or infinite loops
// fail the invention, instead of freezing mouse input. This is an execution budget,
// not a list of permitted game mechanics or a security sandbox.
export class CodeBudget {
 constructor(public maxMs=25){}
 deadline=0;calls=0;
 start(ms=this.maxMs){this.deadline=performance.now()+ms;this.calls=0;}
 check=()=>{if(++this.calls>100000||performance.now()>this.deadline)throw Error('Invention code exceeded its frame budget.');};
}
export function compileCode(source:string,parameters:string[]=['game'],budget=new CodeBudget()){
 const ast:any=parse(source,{ecmaVersion:'latest',sourceType:'script',allowReturnOutsideFunction:true});
 const check=()=>({type:'ExpressionStatement',expression:{type:'CallExpression',callee:{type:'Identifier',name:'__frameBudgetCheck'},arguments:[],optional:false}});
 function walk(node:any){
  if(!node||typeof node!=='object')return;
  for(const key of Object.keys(node)){const value=node[key];if(Array.isArray(value))value.forEach(walk);else if(value&&typeof value==='object')walk(value);}
  if(['ForStatement','ForInStatement','ForOfStatement','WhileStatement','DoWhileStatement'].includes(node.type)){
   if(node.body.type!=='BlockStatement')node.body={type:'BlockStatement',body:[node.body]};node.body.body.unshift(check());
  }
  if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type)){
   if(node.body.type!=='BlockStatement'){node.body={type:'BlockStatement',body:[{type:'ReturnStatement',argument:node.body}]};node.expression=false;}
   node.body.body.unshift(check());
  }
 }
 walk(ast);
 const fn=new Function(...parameters,'__frameBudgetCheck','"use strict";\n'+generate(ast)+'\n//# sourceURL=astra-invention.js');
 return (...args:unknown[])=>{budget.start();return fn(...args,budget.check);};
}
