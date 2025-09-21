// MH Barbearia - Script principal (localStorage based)
'use strict';

/* ========== Dados iniciais (serviços e barbeiros) ========== */
const SERVICES = [
  { id: 's1', name: 'Corte Clássico', duration: 30, price: 35 },
  { id: 's2', name: 'Barba & Bigode', duration: 20, price: 25 },
  { id: 's3', name: 'Combo Completo', duration: 50, price: 55 },
  { id: 's4', name: 'Corte Infantil', duration: 25, price: 30 }
];

const BARBERS = [
  { id: 'b1', name: 'Matheus Henrique', note: 'Cortes Clássicos' },
  { id: 'b2', name: 'Devanil Junior', note: 'Barbas & Bigodes' },
  { id: 'b3', name: 'Victor Mailon', note: 'Cortes Modernos' },
  { id: 'b4', name: 'Gustavo Castilho', note: 'Acabamentos' }
];

/* LocalStorage keys */
const LS_BOOKINGS = 'mh_bookings_v1';
const LS_USERS = 'mh_users_v1';
const LS_SESSION = 'mh_session_v1';

/* Util */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* App state while agendando */
let bookingState = {
  serviceId: null,
  barberId: null,
  date: null,
  timeslot: null,
  customer: {}
};

/* Inicialização ao carregar DOM */
document.addEventListener('DOMContentLoaded', () => {
  setupDateInputs();
  renderServices();
  renderBarbers();
  bindFormSteps();
  renderSchedule(); // tabela inicial
  bindRegisterLogin();
  loadSession();
  updateStatsForDate(getTodayISO());
  bindHeroButtons();
});

/* ====== Helpers de data ====== */
function getTodayISO(){
  const d = new Date();
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function formatDateBR(iso){
  if(!iso) return '';
  const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`;
}

/* ====== Setup inputs de data mínimos ====== */
function setupDateInputs(){
  const min = getTodayISO();
  $('#booking-date').setAttribute('min', min);
  $('#calendar-date').setAttribute('min', min);
  $('#booking-date').value = min;
  $('#calendar-date').value = min;
  $('#calendar-date').addEventListener('change', e => {
    renderSchedule(e.target.value);
    updateStatsForDate(e.target.value);
  });
}

/* ====== Render serviços e barbeiros (passo 1) ====== */
function renderServices(){
  const container = $('#services-list');
  container.innerHTML = '';
  SERVICES.forEach(s => {
    const div = document.createElement('div');
    div.className = 'service';
    div.dataset.id = s.id;
    div.innerHTML = `<h4>${s.name}</h4><p>${s.duration} min — R$ ${s.price}</p>`;
    div.addEventListener('click', () => {
      $$('.service').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      bookingState.serviceId = s.id;
    });
    container.appendChild(div);
  });
}

function renderBarbers(){
  const container = $('#barbers-list');
  container.innerHTML = '';
  BARBERS.forEach(b => {
    const div = document.createElement('div');
    div.className = 'barber';
    div.dataset.id = b.id;
    div.innerHTML = `<h4>${b.name}</h4><p>${b.note}</p>`;
    div.addEventListener('click', () => {
      $$('.barber').forEach(el => el.classList.remove('selected'));
      div.classList.add('selected');
      bookingState.barberId = b.id;
    });
    container.appendChild(div);
  });
}

/* ====== Steps do formulário ====== */
function bindFormSteps(){
  // Step navigation buttons
  $('#to-step-2').addEventListener('click', () => {
    if(!bookingState.serviceId || !bookingState.barberId){
      showBookingMsg('Escolha um serviço e um barbeiro antes de continuar.', 'error');
      return;
    }
    goToStep(2);
    loadTimeslotsForSelected();
  });
  $('#back-to-1').addEventListener('click', () => goToStep(1));
  $('#to-step-3').addEventListener('click', () => {
    const dateVal = $('#booking-date').value;
    if(!dateVal || !bookingState.timeslot){
      showBookingMsg('Selecione uma data e um horário antes de prosseguir.', 'error');
      return;
    }
    bookingState.date = dateVal;
    goToStep(3);
  });
  $('#back-to-2').addEventListener('click', () => goToStep(2));

  // Submit agendamento
  $('#booking-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#customer-name').value.trim();
    const phone = $('#customer-phone').value.trim();
    const email = $('#customer-email').value.trim();
    if(!name || !phone || !email) {
      showBookingMsg('Preencha todos os dados pessoais.', 'error');
      return;
    }

    bookingState.customer = { name, phone, email, createdAt: new Date().toISOString() };
    saveBooking(bookingState);
    showBookingMsg('Agendamento realizado com sucesso!', 'success');
    resetBookingState();
    // atualiza tabela/estatísticas
    renderSchedule($('#calendar-date').value || getTodayISO());
    updateStatsForDate($('#calendar-date').value || getTodayISO());
    goToStep(1);
  });

  // timeslot clicks handled in loadTimeslotsForSelected
}

/* mudanca visual de steps */
function goToStep(n){
  $$('.form-step').forEach(el => el.classList.add('hidden'));
  const el = document.querySelector(`.form-step[data-step="${n}"]`);
  if(el) el.classList.remove('hidden');
  $$('.step').forEach(s => s.classList.remove('active'));
  const stepPill = document.querySelector(`.step[data-step="${n}"]`);
  if(stepPill) stepPill.classList.add('active');
}

/* exibir mensagens do fluxo de agendamento */
function showBookingMsg(msg, type='info'){
  const el = $('#booking-msg');
  el.textContent = msg;
  el.style.color = type === 'success' ? 'lightgreen' : (type==='error' ? '#ff9b9b' : '#ddd');
  setTimeout(()=> el.textContent = '', 4500);
}

/* ========== Timeslots (simples) ========== */
/* Geramos blocos de horários a cada 30 minutos entre 09:00 e 19:00 */
function generateTimeslots(){
  const slots = [];
  for(let h=9; h<=18; h++){
    slots.push(`${String(h).padStart(2,'0')}:00`);
    slots.push(`${String(h).padStart(2,'0')}:30`);
  }
  slots.push('19:00');
  return slots;
}

function loadTimeslotsForSelected(){
  const date = $('#booking-date').value;
  const barberId = bookingState.barberId;
  const container = $('#timeslots');
  container.innerHTML = '';
  if(!date || !barberId) {
    container.textContent = 'Selecione data e barbeiro.';
    return;
  }

  const booked = getBookingsForBarberDate(barberId, date).map(b => b.timeslot);
  const slots = generateTimeslots();
  slots.forEach(s => {
    const el = document.createElement('div');
    el.className = 'timeslot';
    el.textContent = s;
    if(booked.includes(s)){
      el.classList.add('booked');
      el.style.opacity = '0.35';
      el.style.cursor = 'not-allowed';
      el.title = 'Horário já reservado';
    } else {
      el.classList.add('available');
      el.addEventListener('click', () => {
        $$('.timeslot').forEach(t => t.classList.remove('selected'));
        el.classList.add('selected');
        bookingState.timeslot = s;
      });
    }
    container.appendChild(el);
  });
}

/* ========== Persistência de agendamentos ========== */
function getStoredBookings(){
  try{
    const raw = localStorage.getItem(LS_BOOKINGS);
    return raw ? JSON.parse(raw) : [];
  }catch(e){ return []; }
}

function saveStoredBookings(arr){
  localStorage.setItem(LS_BOOKINGS, JSON.stringify(arr));
}

/* salvar novo agendamento */
function saveBooking(state){
  const bookings = getStoredBookings();
  const service = SERVICES.find(s => s.id === state.serviceId);
  const barber = BARBERS.find(b => b.id === state.barberId);
  const newB = {
    id: 'bk_' + Date.now(),
    serviceId: state.serviceId,
    barberId: state.barberId,
    serviceName: service.name,
    duration: service.duration,
    price: service.price,
    barberName: barber.name,
    date: state.date,
    timeslot: state.timeslot,
    customer: state.customer,
    status: 'confirmado',
    createdAt: new Date().toISOString()
  };
  bookings.push(newB);
  saveStoredBookings(bookings);
}

/* buscar agendamentos por barbeiro/data */
function getBookingsForBarberDate(barberId, date){
  const bookings = getStoredBookings();
  return bookings.filter(b => b.barberId === barberId && b.date === date);
}

/* resetar estado */
function resetBookingState(){
  bookingState = { serviceId:null, barberId:null, date:null, timeslot:null, customer:{} };
  $$('.service').forEach(el => el.classList.remove('selected'));
  $$('.barber').forEach(el => el.classList.remove('selected'));
  $('#booking-date').value = getTodayISO();
  $('#timeslots').innerHTML = '';
  $('#customer-name').value = '';
  $('#customer-phone').value = '';
  $('#customer-email').value = '';
}

/* ========== Render tabela de horários (horarios section) ========== */
function renderSchedule(date = getTodayISO()){
  const tbody = document.querySelector('#schedule-table tbody');
  tbody.innerHTML = '';
  const times = generateTimeslots();
  times.forEach(t => {
    const tr = document.createElement('tr');
    const tdTime = document.createElement('td');
    tdTime.textContent = t;
    tr.appendChild(tdTime);
    BARBERS.forEach(b => {
      const td = document.createElement('td');
      const bookings = getBookingsForBarberDate(b.id, date).filter(bk => bk.timeslot === t);
      if(bookings.length){
        const bk = bookings[0];
        const div = document.createElement('div');
        div.innerHTML = `<div class="status-chip status-confirm">${bk.customer.name}<br><small>${bk.serviceName}</small></div>`;
        td.appendChild(div);
      } else {
        const btn = document.createElement('button');
        btn.className = 'btn';
        btn.textContent = 'Disponível';
        btn.addEventListener('click', () => quickBookFromTable(b.id, date, t));
        td.appendChild(btn);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

/* Ao clicar em disponível na tabela: preenche o form com barb e hora */
function quickBookFromTable(barberId, date, timeslot){
  // selecionar service default if not chosen
  if(!bookingState.serviceId) bookingState.serviceId = SERVICES[0].id;
  bookingState.barberId = barberId;
  bookingState.date = date;
  bookingState.timeslot = timeslot;
  // marcar UI
  $$('.service').forEach(el => el.classList.remove('selected'));
  const selService = document.querySelector(`.service[data-id="${bookingState.serviceId}"]`);
  if(selService) selService.classList.add('selected');
  $$('.barber').forEach(el => el.classList.remove('selected'));
  const selBarber = document.querySelector(`.barber[data-id="${barberId}"]`);
  if(selBarber) selBarber.classList.add('selected');
  $('#booking-date').value = date;
  loadTimeslotsForSelected();
  // select the timeslot visually
  setTimeout(()=>{
    const ts = $$('.timeslot');
    ts.forEach(el => {
      if(el.textContent.trim() === timeslot && !el.classList.contains('booked')){
        el.click();
      }
    });
    goToStep(3);
  }, 150);
}

/* ========== Estatísticas e faturamento do dia ========== */
function updateStatsForDate(date = getTodayISO()){
  const all = getStoredBookings().filter(b => b.date === date);
  const confirmed = all.filter(b => b.status === 'confirmado').length;
  const pending = all.filter(b => b.status === 'pendente').length;
  const availableCount = generateTimeslots().length * BARBERS.length - all.length;
  const revenue = all.reduce((sum, b) => sum + (b.status === 'confirmado' ? Number(b.price) : 0), 0);

  $('#stat-confirmed').textContent = confirmed;
  $('#stat-pending').textContent = pending;
  $('#stat-available').textContent = availableCount;
  $('#stat-revenue').textContent = `R$ ${revenue.toFixed(2).replace('.',',')}`;
}

/* ========== Cadastro / Login simples (localStorage) ========== */
function bindRegisterLogin(){
  $('#register-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#reg-name').value.trim();
    const phone = $('#reg-phone').value.trim();
    const email = $('#reg-email').value.trim().toLowerCase();
    const pass = $('#reg-password').value;
    const pass2 = $('#reg-password2').value;
    if(pass !== pass2){ $('#register-msg').textContent = 'Senhas não conferem.'; return; }
    let users = JSON.parse(localStorage.getItem(LS_USERS) || '[]');
    if(users.find(u => u.email === email)){ $('#register-msg').textContent = 'Email já cadastrado.'; return; }
    users.push({ id: 'u_'+Date.now(), name, phone, email, password: pass });
    localStorage.setItem(LS_USERS, JSON.stringify(users));
    $('#register-msg').textContent = 'Conta criada com sucesso! Faça login.';
    $('#register-form').reset();
    setTimeout(()=> $('#register-msg').textContent = '', 3000);
  });

  $('#login-form').addEventListener('submit', e => {
    e.preventDefault();
    const email = $('#login-email').value.trim().toLowerCase();
    const pass = $('#login-password').value;
    const users = JSON.parse(localStorage.getItem(LS_USERS) || '[]');
    const u = users.find(x => x.email === email && x.password === pass);
    if(!u){ $('#login-msg').textContent = 'Credenciais inválidas.'; return; }
    localStorage.setItem(LS_SESSION, JSON.stringify({ userId: u.id, email: u.email, name: u.name }));
    $('#login-msg').textContent = 'Login efetuado com sucesso!';
    $('#login-form').reset();
    setTimeout(()=> $('#login-msg').textContent = '', 2000);
  });
}

function loadSession(){
  const s = localStorage.getItem(LS_SESSION);
  if(!s) return;
  try{
    const obj = JSON.parse(s);
    // poderia alterar UI para mostrar usuário logado
    console.log('Usuário logado:', obj.name);
  }catch(e){}
}

/* ===== Botões hero / abrir agendar ===== */
function bindHeroButtons(){
  $('#hero-agendar').addEventListener('click', () => {
    document.location.hash = '#agendamento';
    window.scrollTo({top: document.querySelector('#agendamento').offsetTop - 80, behavior:'smooth'});
  });
  $('#open-agendar').addEventListener('click', () => {
    document.location.hash = '#agendamento';
    window.scrollTo({top: document.querySelector('#agendamento').offsetTop - 80, behavior:'smooth'});
  });
}

/* ===== Inicial render de composição ===== */
(function initialRender(){
  // adicionar serviços e barbeiros no DOM (chamados logo no DOMContentLoaded)
})();
