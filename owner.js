const API='https://maritime-assessment-v22.alexpastuch.workers.dev';
const PORTAL='https://alexpastuch.github.io/maritime-assessment-v22/';
const $=id=>document.getElementById(id);
let token=sessionStorage.getItem('mae_owner_token')||'';
let lastInvite='';
const DASHBOARD_PAGE_SIZE = 100;
const tables = {
  requests: {title:'Assessment requests', hiddenTitle:'Hidden requests', render:renderRequests, page:0, load:0},
  exams: {title:'Recent assessments', hiddenTitle:'Hidden assessments', render:renderExams, page:0, load:0},
};
function resetTableViews() {
  for (const table of Object.values(tables)) {
    table.page = 0;
    table.load++;
  }
}
function msg(id,text,ok=false){const e=$(id);e.textContent=text||'';e.className=ok?'ok':'err';}
async function api(path,opt={}){const h={'content-type':'application/json',...(opt.headers||{})};if(token)h.authorization='Bearer '+token;const r=await fetch(API+path,{...opt,headers:h});let j={};try{j=await r.json()}catch{}if(!r.ok)throw new Error(j.error||j.detail||('HTTP '+r.status));return j;}
function showApp(on){$('authArea').classList.toggle('hidden',on);$('appArea').classList.toggle('hidden',!on);$('logoutBtn').classList.toggle('hidden',!on);}
$('setupBtn').onclick=async()=>{try{msg('setupMsg','');const secret=$('bootstrapSecret').value.trim(),password=$('setupPassword').value;const j=await api('/api/owner/bootstrap',{method:'POST',headers:{'x-bootstrap-secret':secret},body:JSON.stringify({password})});$('setupResult').classList.remove('hidden');$('setupQr').innerHTML='';new QRCode($('setupQr'),{text:j.otpauth_uri,width:230,height:230});$('confirmSetupBtn').dataset.bootstrap=secret;msg('setupMsg','QR generated. Scan it once, then enter a fresh code.',true);}catch(e){msg('setupMsg',e.message)}};
$('confirmSetupBtn').onclick=async()=>{try{const secret=$('confirmSetupBtn').dataset.bootstrap||$('bootstrapSecret').value.trim();await api('/api/owner/bootstrap/confirm',{method:'POST',headers:{'x-bootstrap-secret':secret},body:JSON.stringify({code:$('setupCode').value})});msg('setupMsg','Phone token confirmed. You can now log in.',true);$('setupResult').classList.add('hidden');}catch(e){msg('setupMsg',e.message)}};
$('loginBtn').onclick=async()=>{try{msg('loginMsg','');const j=await api('/api/owner/login',{method:'POST',body:JSON.stringify({password:$('loginPassword').value,code:$('loginCode').value})});token=j.token;sessionStorage.setItem('mae_owner_token',token);showApp(true);await refresh();}catch(e){msg('loginMsg',e.message)}};
$('logoutBtn').onclick=async()=>{try{await api('/api/owner/logout',{method:'POST',body:'{}'});}catch{}token='';resetTableViews();sessionStorage.removeItem('mae_owner_token');showApp(false)};
$('createRequestBtn').onclick=async()=>{try{const j=await api('/api/owner/requests',{method:'POST',body:JSON.stringify({candidate_name:$('candidateName').value,candidate_email:$('candidateEmail').value,candidate_id:$('candidateId').value,rank:$('rank').value,assessment_mode:$('mode').value})});msg('requestMsg',`Request #${j.id} created as PENDING.`,true);await refresh();}catch(e){msg('requestMsg',e.message)}};
$('importBankBtn').onclick=async()=>{try{const f=$('bankFile').files[0];if(!f)throw new Error('Select the JSON bank file first.');const data=JSON.parse(await f.text()),qs=data.questions||[];if(!qs.length)throw new Error('No questions found in the selected file.');let done=0;for(let i=0;i<qs.length;i+=40){const chunk=qs.slice(i,i+40);await api('/api/owner/bank/import',{method:'POST',body:JSON.stringify({questions:chunk})});done+=chunk.length;$('importBar').style.width=(done*100/qs.length).toFixed(1)+'%';$('importMsg').textContent=`Imported ${done} / ${qs.length}`;}$('importMsg').textContent=`Import complete: ${done} questions.`;await refresh();}catch(e){$('importMsg').textContent='ERROR: '+e.message;}};
function status(s){return `<span class="status ${String(s||'')}">${String(s||'')}</span>`}
function fmt(x){if(!x)return '—';try{return new Date(x).toLocaleString()}catch{return x}}
function handleDashboardError(error) {
  if (/unauthorized/.test(error.message)) {
    if (!token) return;
    token = '';
    resetTableViews();
    sessionStorage.removeItem('mae_owner_token');
    showApp(false);
    msg('loginMsg','Session expired. Log in again.');
  } else alert(error.message);
}

async function refresh() {
  const active = api('/api/owner/dashboard');
  const bank = api('/api/owner/bank/status').then(data => {
    $('mQuestions').textContent = data.total;
    $('bankDist').innerHTML = '<p class="small">' + (data.distribution || [])
      .map(item => item.answer_count + ' correct: <b>' + item.n + '</b>').join(' · ') + '</p>';
  }).catch(handleDashboardError);
  await Promise.all([bank, ...Object.keys(tables).map(kind => refreshTable(kind, tables[kind].page, active))]);
}

async function refreshTable(kind, page = tables[kind].page, activeRequest = api('/api/owner/dashboard')) {
  const table = tables[kind];
  const load = ++table.load;
  try {
    const [active, data] = await Promise.all([
      activeRequest,
      page ? api('/api/owner/archive?page=' + page) : activeRequest,
    ]);
    if (load !== table.load) return;
    const rows = data[kind];
    if (page > table.page && page > 1 && !rows.length) {
      $(kind + 'Next').disabled = true;
      return;
    }
    table.page = page;
    $('mPending').textContent = active.requests.filter(item => item.status === 'PENDING').length;
    $('mExams').textContent = active.exams.length;
    const hasNext = page > 0 && data.has_more && rows.length === DASHBOARD_PAGE_SIZE;
    $(kind + 'Title').textContent = page ? table.hiddenTitle : table.title;
    $(kind + 'Toggle').textContent = page ? 'Back to active' : 'Show hidden';
    $(kind + 'Selection').textContent = page ? 'Restore selected' : 'Hide selected';
    $(kind + 'Pager').classList.toggle('hidden', !hasNext && page <= 1);
    $(kind + 'Page').textContent = page ? 'Page ' + page : '';
    $(kind + 'Previous').disabled = page <= 1;
    $(kind + 'Next').disabled = !hasNext;
    table.render(rows, page > 0);
  } catch (error) {
    if (load === table.load) handleDashboardError(error);
  }
}

function renderRequests(rows, archived){$('requestsBody').innerHTML=rows.map(r=>`<tr><td><input class="reqHide" type="checkbox" value="${r.id}"></td><td>${r.id}</td><td><b>${esc(r.candidate_name)}</b><br><span class="small muted">${esc(r.candidate_email||'')}</span></td><td>${esc(r.rank)}</td><td>${status(r.status)}</td><td>${fmt(r.created_at)}</td><td>${archived?'—':r.status==='PENDING'?`<button onclick="approveReq(${r.id})">Approve</button> <button class="danger" onclick="rejectReq(${r.id})">Reject</button>`:(r.exam_id?`<button class="ghost" onclick="showInvite('${escAttr(r.exam_id)}')">Invitation</button>`:'')}</td></tr>`).join('')||'<tr><td colspan="7">' +(archived?'No hidden requests.':'No requests.')+'</td></tr>'}
function renderExams(rows, archived){$('examsBody').innerHTML=rows.map(e=>`<tr><td><input class="examHide" type="checkbox" value="${escAttr(e.id)}"></td><td><span class="small">${esc(e.id)}</span></td><td>${esc(e.candidate_name)}</td><td>${esc(e.rank)}</td><td>${status(e.status)}</td><td>${e.score_percent==null?'—':`${e.score_correct}/45 · ${e.score_percent}% · <b>${e.result||''}</b>`}</td><td>${Number(e.focus_loss_count||0)} focus · ${Number(e.copy_attempts||0)} copy</td><td><button class="ghost" onclick="viewExam('${escAttr(e.id)}')">View</button>${archived?'':` <button class="ghost" onclick="showInvite('${escAttr(e.id)}')">Invitation</button>${['NEW','PAIRING','VERIFIED'].includes(e.status)?` <button class="ghost" onclick="resetPairing('${escAttr(e.id)}')">Reset pairing</button>`:''}${!['CLOSED','INVALIDATED'].includes(e.status)?` <button class="danger" onclick="invalidateExam('${escAttr(e.id)}')">Invalidate</button>`:''}`}</td></tr>`).join('')||'<tr><td colspan="8">'+(archived?'No hidden assessments.':'No assessments.')+'</td></tr>'}
async function approveReq(id){const code=prompt('Enter a FRESH 6-digit Authenticator code. A code used for login/another action cannot be reused.');if(!code)return;try{const j=await api(`/api/owner/requests/${id}/approve`,{method:'POST',body:JSON.stringify({code})});await showInvite(j.exam_id,j);await refresh();}catch(e){alert(e.message)}}
async function rejectReq(id){const code=prompt('Enter a fresh 6-digit Authenticator code to reject this request.');if(!code)return;try{await api(`/api/owner/requests/${id}/reject`,{method:'POST',body:JSON.stringify({code})});await refresh();}catch(e){alert(e.message)}}
async function showInvite(id,prefetched=null){try{const j=prefetched||await api(`/api/owner/exams/${encodeURIComponent(id)}/invitation`);const text=`Maritime Competency Assessment Invitation\n\nCandidate: ${j.candidate_name}\nRank: ${j.rank}\n\nOpen this portal on the computer or iPad where you will take the assessment:\n${j.portal_url||PORTAL}\n\nInvitation Code: ${j.invitation_code}\n\nThe assessment becomes available only after computer verification.`;lastInvite=text;$('invitationText').innerHTML=`<p><b>${esc(j.candidate_name)}</b> · ${esc(j.rank)}</p><p>Portal: <a href="${PORTAL}" target="_blank">${PORTAL}</a></p><div class="codebox">${esc(j.invitation_code)}</div>`;$('invitationCard').classList.remove('hidden');$('mailInviteBtn').href=`mailto:${encodeURIComponent(j.candidate_email||'')}?subject=${encodeURIComponent('Maritime Competency Assessment Invitation')}&body=${encodeURIComponent(text)}`;$('invitationCard').scrollIntoView({behavior:'smooth'});}catch(e){alert(e.message)}}
$('copyInviteBtn').onclick=async()=>{if(lastInvite){await navigator.clipboard.writeText(lastInvite);$('copyInviteBtn').textContent='Copied';setTimeout(()=>$('copyInviteBtn').textContent='Copy invitation',1500)}};
function answerOptions(question, selection, emptyLabel) {
  const letters = new Set(String(selection ?? '').toUpperCase().match(/[A-D]/g) || []);
  if (!letters.size) return esc(emptyLabel);
  return `<ul class="report-options">${Array.from(letters, letter => {
    const option = question['option_' + letter.toLowerCase()];
    return `<li><b>${letter}.</b> ${esc(option ?? 'Answer text unavailable')}</li>`;
  }).join('')}</ul>`;
}

async function viewExam(id) {
  try {
    const { exam, questions = [], events = [] } = await api(`/api/owner/exams/${encodeURIComponent(id)}`);
    const score = exam.score_percent == null ? '—' :
      `${exam.score_correct}/${exam.question_count ?? questions.length} · ${exam.score_percent}%`;
    const rows = questions.map(question => `
      <tr>
        <td>${esc(question.sequence_no)}</td>
        <td>${esc(question.question_text)}</td>
        <td>${answerOptions(question, question.candidate_answer, 'No answer recorded')}</td>
        <td>${answerOptions(question, question.correct_display, '—')}</td>
        <td>${question.response_seconds == null ? '—' : Math.round(question.response_seconds) + ' s'}</td>
      </tr>`).join('');

    $('detailContent').innerHTML = `
      <div class="grid3 report-metrics">
        <div class="metric">Status<b>${esc(exam.status)}</b></div>
        <div class="metric">Score<b>${esc(score)}</b></div>
        <div class="metric">Result<b>${esc(exam.result || '—')}</b></div>
      </div>
      <p><b>${esc(exam.candidate_name)}</b> · ${esc(exam.rank)} · Exam ID: ${esc(exam.id)}</p>
      <p>Started: ${esc(fmt(exam.started_at))} · Submitted: ${esc(fmt(exam.submitted_at))} · Pass mark: ${esc(exam.pass_mark_percent ?? 70)}%</p>
      <p>Focus losses: ${esc(exam.focus_loss_count ?? 0)} · Focus seconds: ${Math.round(exam.focus_loss_seconds || 0)} · Copy attempts: ${esc(exam.copy_attempts ?? 0)} · Integrity events: ${events.length}</p>
      <div class="tablewrap report-table-wrap">
        <table class="report-table">
          <colgroup><col class="report-number"><col><col class="report-answer"><col class="report-answer"><col class="report-time"></colgroup>
          <thead><tr><th scope="col">#</th><th scope="col">Question</th><th scope="col">Candidate answer</th><th scope="col">Correct answer</th><th scope="col">Time</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    $('detailCard').classList.remove('hidden');
    $('detailCard').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    alert(error.message);
  }
}

async function resetPairing(id){const code=prompt('Enter a fresh Authenticator code to reset computer verification.');if(!code)return;try{await api(`/api/owner/exams/${encodeURIComponent(id)}/reset-pairing`,{method:'POST',body:JSON.stringify({code})});await refresh();}catch(e){alert(e.message)}}
async function invalidateExam(id){if(!confirm('Invalidate this assessment? It will no longer be usable.'))return;const code=prompt('Enter a fresh Authenticator code.');if(!code)return;try{await api(`/api/owner/exams/${encodeURIComponent(id)}/invalidate`,{method:'POST',body:JSON.stringify({code})});await refresh();}catch(e){alert(e.message)}}
async function changeSelectedVisibility(kind) {
  const restoring = tables[kind].page > 0;
  const isRequest = kind === 'requests';
  const selector = isRequest ? '.reqHide:checked' : '.examHide:checked';
  const ids = [...document.querySelectorAll(selector)].map(item => item.value);
  if (!ids.length) {
    alert('Select at least one item.');
    return;
  }
  const action = restoring ? 'restore' : 'hide';
  const code = prompt('Enter a fresh Authenticator code to ' + action + ' the selected items.');
  if (!code) return;
  const payload = {code, request_ids: [], exam_ids: []};
  payload[isRequest ? 'request_ids' : 'exam_ids'] = ids;
  try {
    await api('/api/owner/' + action,{method:'POST',body:JSON.stringify(payload)});
    await refreshTable(kind, tables[kind].page ? 1 : 0);
  } catch (error) {
    alert(error.message);
  }
}
for (const [kind, table] of Object.entries(tables)) {
  $(kind + 'Selection').onclick = () => changeSelectedVisibility(kind);
  $(kind + 'Toggle').onclick = () => refreshTable(kind, table.page ? 0 : 1);
  $(kind + 'Refresh').onclick = () => refreshTable(kind);
  $(kind + 'Previous').onclick = () => refreshTable(kind, table.page - 1);
  $(kind + 'Next').onclick = () => refreshTable(kind, table.page + 1);
}
$('closeDetailBtn').onclick=()=>$('detailCard').classList.add('hidden');
$('printDetailBtn').onclick = () => window.print();
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function escAttr(s){return String(s??'').replace(/'/g,"\\'")}
if(token){showApp(true);refresh()}else showApp(false);
