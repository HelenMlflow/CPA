const graphRoot = 'https://graph.microsoft.com/v1.0';
export const configured = () => ['MS_TENANT_ID','MS_CLIENT_ID','MS_CLIENT_SECRET','SHAREPOINT_DRIVE_ID','SHAREPOINT_PARENT_ID'].every(k=>process.env[k]);
async function token() {
 const r=await fetch(`https://login.microsoftonline.com/${encodeURIComponent(process.env.MS_TENANT_ID)}/oauth2/v2.0/token`,{method:'POST',body:new URLSearchParams({client_id:process.env.MS_CLIENT_ID,client_secret:process.env.MS_CLIENT_SECRET,scope:'https://graph.microsoft.com/.default',grant_type:'client_credentials'})});
 if(!r.ok) throw new Error('Microsoft authentication failed. Contact your accountant.');
 return (await r.json()).access_token;
}
async function graph(path,method='GET',body,raw=false){
 const r=await fetch(graphRoot+path,{method,headers:{Authorization:`Bearer ${await token()}`,'Content-Type':raw?'application/octet-stream':'application/json'},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
 if(!r.ok) throw new Error(`SharePoint request failed (${r.status}). Contact your accountant.`);
 return r.status===204?null:r.json();
}
export async function provision(user,save) {
 const drive=encodeURIComponent(process.env.SHAREPOINT_DRIVE_ID);
 // Persist each step so retries reuse the existing identity and folder.
 if(!user.guest_id){const invitation=await graph('/invitations','POST',{invitedUserEmailAddress:user.email,invitedUserDisplayName:user.name,inviteRedirectUrl:process.env.PUBLIC_URL+'/portal',sendInvitationMessage:false});user.guest_id=invitation.invitedUser.id;await save(user);}
 if(!user.folder_id){const folder=await graph(`/drives/${drive}/items/${encodeURIComponent(process.env.SHAREPOINT_PARENT_ID)}/children`,'POST',{name:user.id,folder:{},'@microsoft.graph.conflictBehavior':'fail'});user.folder_id=folder.id;await save(user);}
 await graph(`/drives/${drive}/items/${encodeURIComponent(user.folder_id)}/invite`,'POST',{recipients:[{objectId:user.guest_id}],roles:['write'],requireSignIn:true,sendInvitation:false});
 user.provisioning='ready';await save(user);
}
export async function upload(user,name,bytes){return graph(`/drives/${encodeURIComponent(process.env.SHAREPOINT_DRIVE_ID)}/items/${encodeURIComponent(user.folder_id)}:/${encodeURIComponent(name)}:/content`,'PUT',bytes,true);}
