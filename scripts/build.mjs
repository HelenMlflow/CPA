import {access} from 'node:fs/promises';
for(const file of ['public/index.html','public/portal.html','public/portal.js','api/index.mjs'])await access(file);
console.log('Static website and portal assets ready. API configuration is checked when the portal is accessed.');
