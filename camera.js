'use strict';
const element=id=>document.getElementById(id);
const query=new URL(location.href).searchParams;
const challenge=String(query.get('challenge')||'');
const returnOrigin=String(query.get('returnOrigin')||'').toLowerCase();
const action=String(query.get('action')||'');
const statusDay=String(query.get('status')||'');
const allowedReturnOrigin=/^https:\/\/(?:[a-z0-9.-]+\.)?googleusercontent\.com$/.test(returnOrigin)||returnOrigin==='https://script.google.com';
const validContext=/^[a-f0-9]{64}$/i.test(challenge)&&allowedReturnOrigin&&['CHECK IN','CHECK OUT'].includes(action)&&statusDay==='Out of Office';
let stream=null;
let facingMode='environment';
let captured=null;
let gpsPosition=null;

function showStatus(text){element('cameraStatus').textContent=text;}
function stopStream(){
  if(stream)stream.getTracks().forEach(track=>track.stop());
  stream=null;
  const video=element('cameraVideo');
  if(video)video.srcObject=null;
}
function mapError(error){
  const name=error&&error.name||'';
  if(name==='NotAllowedError'||name==='SecurityError')return'ไม่สามารถใช้กล้องได้ กรุณาอนุญาต Camera สำหรับเว็บไซต์นี้ใน Chrome';
  if(name==='NotFoundError'||name==='DevicesNotFoundError')return'ไม่พบกล้องบนอุปกรณ์นี้';
  if(name==='NotReadableError'||name==='TrackStartError')return'กล้องกำลังถูกใช้งานโดยแอปอื่น';
  if(name==='OverconstrainedError'||name==='ConstraintNotSatisfiedError')return'กล้องไม่รองรับโหมดที่เลือก กรุณากดสลับกล้อง';
  if(error&&Number(error.code)===1)return'กรุณาอนุญาต Location/GPS สำหรับเว็บไซต์นี้';
  if(error&&Number(error.code)===2)return'ไม่พบตำแหน่งปัจจุบัน กรุณาเปิด GPS';
  if(error&&Number(error.code)===3)return'ตรวจสอบตำแหน่งนานเกินไป กรุณาลองใหม่';
  return'เปิดกล้องหรือ GPS ไม่สำเร็จ กรุณาลองใหม่';
}
function getFreshPosition(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error('GEOLOCATION_UNAVAILABLE'));return;}
    navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  });
}
async function openCamera(){
  if(!validContext)throw new Error('INVALID_CAPTURE_CONTEXT');
  stopStream();captured=null;
  element('cameraPhoto').classList.add('hidden');
  element('cameraVideo').classList.remove('hidden');
  element('cameraUse').classList.add('hidden');
  element('cameraRetake').classList.add('hidden');
  element('cameraTake').classList.remove('hidden');
  if(!window.isSecureContext||!navigator.mediaDevices||typeof navigator.mediaDevices.getUserMedia!=='function')throw new Error('CAMERA_API_UNAVAILABLE');
  [stream,gpsPosition]=await Promise.all([
    navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facingMode},width:{ideal:1280},height:{ideal:1280}}}),
    getFreshPosition()
  ]);
  element('cameraVideo').srcObject=stream;
  await element('cameraVideo').play();
  showStatus('พร้อมถ่ายภาพ');
}
function capturePhoto(){
  const video=element('cameraVideo'),canvas=element('cameraCanvas');
  const maximum=1280,scale=Math.min(1,maximum/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
  canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  captured={
    photoData:canvas.toDataURL('image/jpeg',.78),
    photoCapturedAt:new Date().toISOString(),
    captureTimezone:'Asia/Bangkok',
    cameraFacingMode:facingMode,
    latitude:gpsPosition.coords.latitude,
    longitude:gpsPosition.coords.longitude,
    gpsAccuracy:gpsPosition.coords.accuracy,
    action:action,
    statusDay:statusDay
  };
  element('cameraPhoto').src=captured.photoData;
  element('cameraVideo').classList.add('hidden');
  element('cameraPhoto').classList.remove('hidden');
  element('cameraTake').classList.add('hidden');
  element('cameraUse').classList.remove('hidden');
  element('cameraRetake').classList.remove('hidden');
  stopStream();
  showStatus('ตรวจสอบภาพ แล้วกด “ใช้ภาพนี้”');
}
function returnCapture(){
  if(!captured||!window.opener||!validContext)return;
  window.opener.postMessage({type:'MLN_CAMERA_CAPTURED',challenge:challenge,capture:captured},returnOrigin);
  captured=null;
  window.close();
}
function cancel(){
  stopStream();captured=null;
  if(window.opener&&validContext)window.opener.postMessage({type:'MLN_CAMERA_CANCELLED',challenge:challenge},returnOrigin);
  window.close();
}
element('cameraSwitch').onclick=()=>{facingMode=facingMode==='environment'?'user':'environment';openCamera().catch(error=>showStatus(mapError(error)));};
element('cameraTake').onclick=()=>{try{capturePhoto();}catch(error){showStatus(mapError(error));}};
element('cameraRetake').onclick=()=>openCamera().catch(error=>showStatus(mapError(error)));
element('cameraUse').onclick=returnCapture;
element('cameraCancel').onclick=cancel;
addEventListener('pagehide',stopStream);
addEventListener('beforeunload',stopStream);
openCamera().catch(error=>showStatus(error&&error.message==='INVALID_CAPTURE_CONTEXT'?'ลิงก์กล้องไม่ถูกต้องหรือหมดอายุ กรุณากลับไปเปิดจากระบบ HR':mapError(error)));
