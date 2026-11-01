import { registerHooks } from 'node:module';
// The checkout has no root node_modules. Resolve SDK imports against its existing
// fixed runtime instead of installing packages or modifying production folders.
registerHooks({resolve(specifier,context,next){
  try{return next(specifier,context);}catch(error){
    if(error.code!=='ERR_MODULE_NOT_FOUND'||!specifier.startsWith('@deepseek-ai/'))throw error;
    return next(specifier,{...context,parentURL:new URL('../runtime/package.json',import.meta.url).href});
  }
}});
