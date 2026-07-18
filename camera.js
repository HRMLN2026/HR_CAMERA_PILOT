'use strict';
const element=id=>document.getElementById(id);
const query=new URL(location.href).searchParams;
const challenge=String(query.get('challenge')||'');
const returnOrigin=String(query.get('returnOrigin')||'').toLowerCase();
const action=String(query.get('action')||'');
const statusDay=String(query.get('status')||'');
const diagnosticsEnabled=query.get('cameraDiagnostic')==='1';
const allowedReturnOrigin=/^https:\/\/(?:[a-z0-9.-]+\.)?googleusercontent\.com$/.test(returnOrigin)||returnOrigin==='https://script.google.com';
const validContext=/^[a-f0-9]{64}$/i.test(challenge)&&allowedReturnOrigin&&['CHECK IN','CHECK OUT'].includes(action)&&statusDay==='Out of Office';
const GPS_FRESHNESS_MS=30000;
const IMAGE_MAX_LONG_EDGE=1024;
const JPEG_QUALITY=.70;
const sessionStartedAt=Date.now();
const timing={popupLoadMs:Math.round(performance.now()),cameraOpenMs:null,gpsMs:null,captureEncodeMs:null,returnMs:null};
let stream=null;
let facingMode='environment';
let captured=null;
let gpsPosition=null;
let gpsAcquiredAt=0;
let gpsPromise=null;
let captureReturned=false;

function showStatus(text){element('cameraStatus').textContent=text;}
function setCaptureEnabled(enabled){element('cameraTake').disabled=!enabled;}
function stopStream(){
  if(stream)stream.getTracks().forEach(track=>track.stop());
  stream=null;
  const video=element('cameraVideo');
  if(video)video.srcObject=null;
}
function clearCaptured(){
  captured=null;
  const image=element('cameraPhoto');
  if(image){image.removeAttribute('src');image.classList.add('hidden');}
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
function isGpsFresh(){
  return Boolean(gpsPosition)&&gpsAcquiredAt>=sessionStartedAt&&Date.now()-gpsAcquiredAt<=GPS_FRESHNESS_MS;
}
function requestFreshGps(){
  if(isGpsFresh())return Promise.resolve(gpsPosition);
  if(gpsPromise)return gpsPromise;
  const started=performance.now();
  setCaptureEnabled(false);
  gpsPromise=new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error('GEOLOCATION_UNAVAILABLE'));return;}
    navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  }).then(position=>{
    gpsPosition=position;gpsAcquiredAt=Date.now();timing.gpsMs=Math.round(performance.now()-started);
    setCaptureEnabled(true);showStatus('พร้อมถ่ายภาพ');return position;
  }).catch(error=>{
    gpsPosition=null;gpsAcquiredAt=0;setCaptureEnabled(false);showStatus(mapError(error));throw error;
  }).finally(()=>{gpsPromise=null;});
  return gpsPromise;
}
async function openCamera(){
  if(!validContext)throw new Error('INVALID_CAPTURE_CONTEXT');
  stopStream();clearCaptured();
  element('cameraVideo').classList.remove('hidden');
  element('cameraUse').classList.add('hidden');
  element('cameraRetake').classList.add('hidden');
  element('cameraTake').classList.remove('hidden');
  setCaptureEnabled(isGpsFresh());
  showStatus('กำลังเปิดกล้อง...');
  requestFreshGps().catch(()=>{});
  if(!window.isSecureContext||!navigator.mediaDevices||typeof navigator.mediaDevices.getUserMedia!=='function')throw new Error('CAMERA_API_UNAVAILABLE');
  const cameraStarted=performance.now();
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facingMode},width:{ideal:960},height:{ideal:1280}}});
  const video=element('cameraVideo');
  video.srcObject=stream;
  await video.play();
  timing.cameraOpenMs=Math.round(performance.now()-cameraStarted);
  showStatus(isGpsFresh()?'พร้อมถ่ายภาพ':'กล้องพร้อมแล้ว กำลังตรวจสอบตำแหน่ง...');
}
function capturePhoto(){
  if(!isGpsFresh()){
    setCaptureEnabled(false);
    showStatus('กำลังตรวจสอบตำแหน่ง กรุณารอสักครู่');
    requestFreshGps().catch(()=>{});
    return;
  }
  const encodeStarted=performance.now();
  const video=element('cameraVideo'),canvas=element('cameraCanvas');
  const scale=Math.min(1,IMAGE_MAX_LONG_EDGE/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
  canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
  captured={
    photoData:canvas.toDataURL('image/jpeg',JPEG_QUALITY),
    photoCapturedAt:new Date().toISOString(),
    captureTimezone:'Asia/Bangkok',
    cameraFacingMode:facingMode,
    latitude:gpsPosition.coords.latitude,
    longitude:gpsPosition.coords.longitude,
    gpsAccuracy:gpsPosition.coords.accuracy,
    action:action,
    statusDay:statusDay
  };
  timing.captureEncodeMs=Math.round(performance.now()-encodeStarted);
  element('cameraPhoto').src=captured.photoData;
  element('cameraVideo').classList.add('hidden');
  element('cameraPhoto').classList.remove('hidden');
  element('cameraTake').classList.add('hidden');
  element('cameraUse').classList.remove('hidden');
  element('cameraRetake').classList.remove('hidden');
  stopStream();
  showStatus('ตรวจสอบภาพ แล้วกด ใช้ภาพนี้');
}
function returnCapture(){
  if(!captured||!window.opener||!validContext||captureReturned)return;
  captureReturned=true;
  showStatus('กำลังส่งรูปกลับระบบ HR...');
  const started=performance.now();
  const message={type:'MLN_CAMERA_CAPTURED',challenge:challenge,capture:captured};
  if(diagnosticsEnabled)message.cameraTiming=Object.assign({},timing,{returnMs:Math.round(performance.now()-started)});
  window.opener.postMessage(message,returnOrigin);
  captured=null;
  setTimeout(()=>window.close(),0);
}
function cancel(){
  stopStream();clearCaptured();
  if(window.opener&&validContext)window.opener.postMessage({type:'MLN_CAMERA_CANCELLED',challenge:challenge},returnOrigin);
  setTimeout(()=>window.close(),0);
}
element('cameraSwitch').onclick=()=>{
  facingMode=facingMode==='environment'?'user':'environment';
  openCamera().catch(error=>showStatus(mapError(error)));
};
element('cameraTake').onclick=capturePhoto;
element('cameraRetake').onclick=()=>openCamera().catch(error=>showStatus(mapError(error)));
element('cameraUse').onclick=returnCapture;
element('cameraCancel').onclick=cancel;
addEventListener('pagehide',()=>{stopStream();clearCaptured();});
addEventListener('beforeunload',()=>{stopStream();clearCaptured();});
openCamera().catch(error=>showStatus(error&&error.message==='INVALID_CAPTURE_CONTEXT'?'ลิงก์กล้องไม่ถูกต้องหรือหมดอายุ กรุณากลับไปเปิดจากระบบ HR':mapError(error)));
