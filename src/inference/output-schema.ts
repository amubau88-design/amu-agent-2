import {EngineError} from './models.ts';
/** Deliberately bounded subset supported by the embedded grammar compiler. No references. */
export function outputSchema(format:any):object|undefined{
 if(format===undefined)return undefined;
 if(!format||typeof format!=='object'||Array.isArray(format))throw new EngineError(400,'Invalid response_format');
 if(format.type==='json_object')return {type:'object',properties:{},additionalProperties:true};
 if(format.type!=='json_schema'||!format.json_schema||typeof format.json_schema.name!=='string'||format.json_schema.name.length>100)throw new EngineError(400,'Use json_object or a named json_schema');
 const schema=format.json_schema.schema;if(JSON.stringify(schema||{}).length>16384)throw new EngineError(400,'Output schema exceeds 16 KiB');
 let nodes=0;
 function visit(value:any,depth:number){
  if(!value||typeof value!=='object'||Array.isArray(value)||depth>6||++nodes>128)throw new EngineError(400,'Invalid or oversized output schema');
  const allowed=['type','properties','required','additionalProperties','items','enum','description','minItems','maxItems','minLength','maxLength'];
  if(Object.keys(value).some(key=>!allowed.includes(key)))throw new EngineError(400,'Unsupported output schema keyword');
  if(value.enum!==undefined&&(!Array.isArray(value.enum)||!value.enum.length||value.enum.length>64||value.enum.some((v:any)=>v!==null&&!['string','boolean','number'].includes(typeof v))))throw new EngineError(400,'Invalid schema enum');
  if(value.type!==undefined&&!['object','array','string','number','integer','boolean','null'].includes(value.type))throw new EngineError(400,'Unsupported schema type');
  if(value.type===undefined&&value.enum===undefined)throw new EngineError(400,'Schema requires a type or enum');
  if(value.description!==undefined&&(typeof value.description!=='string'||value.description.length>1000))throw new EngineError(400,'Invalid schema description');
  for(const key of ['minItems','maxItems','minLength','maxLength'])if(value[key]!==undefined&&(!Number.isSafeInteger(value[key])||value[key]<0||value[key]>256))throw new EngineError(400,'Invalid schema size constraint');
  if(value.properties!==undefined){if(value.type!=='object'||!value.properties||typeof value.properties!=='object'||Array.isArray(value.properties)||Object.keys(value.properties).length>64)throw new EngineError(400,'Invalid schema properties');for(const item of Object.values(value.properties))visit(item,depth+1);}
  if(value.required!==undefined&&(!Array.isArray(value.required)||value.required.some((key:any)=>typeof key!=='string'||!Object.hasOwn(value.properties||{},key))))throw new EngineError(400,'Invalid required schema fields');
  if(value.additionalProperties!==undefined&&typeof value.additionalProperties!=='boolean')throw new EngineError(400,'Only boolean additionalProperties supported');
  if(value.items!==undefined){if(value.type!=='array')throw new EngineError(400,'items requires array type');visit(value.items,depth+1);}
 }
 visit(schema,0);if(schema.type!=='object')throw new EngineError(400,'Root output schema must be an object');return schema;
}
export function matchesOutputSchema(value:any,schema:any):boolean{
 if(schema.enum&&!schema.enum.includes(value))return false;
 const type=schema.type;if(type==='object'){
  if(!value||typeof value!=='object'||Array.isArray(value))return false;
  if((schema.required||[]).some((key:string)=>!Object.hasOwn(value,key)))return false;
  if(schema.additionalProperties===false&&Object.keys(value).some(key=>!Object.hasOwn(schema.properties||{},key)))return false;
  for(const [key,child]of Object.entries(schema.properties||{}))if(Object.hasOwn(value,key)&&!matchesOutputSchema(value[key],child))return false;
 }else if(type==='array'){
  if(!Array.isArray(value)||(schema.minItems!==undefined&&value.length<schema.minItems)||(schema.maxItems!==undefined&&value.length>schema.maxItems))return false;
  if(schema.items&&value.some(item=>!matchesOutputSchema(item,schema.items)))return false;
 }else if(type==='string'){
  if(typeof value!=='string'||(schema.minLength!==undefined&&Array.from(value).length<schema.minLength)||(schema.maxLength!==undefined&&Array.from(value).length>schema.maxLength))return false;
 }else if(type==='integer'){if(!Number.isSafeInteger(value))return false;}
 else if(type==='number'){if(typeof value!=='number'||!Number.isFinite(value))return false;}
 else if(type==='boolean'){if(typeof value!=='boolean')return false;}
 else if(type==='null'){if(value!==null)return false;}
 return true;
}
