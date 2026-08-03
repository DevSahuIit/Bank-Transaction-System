const API = "/api";

const state = {
  user: null,
  accounts: [],
  transactions: [],
  contacts: [], // Added to track the friend list globally
};

/* ---------- helpers ---------- */

function $(sel, root = document) { return root.querySelector(sel); }
function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function money(n) {
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, 3500);
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let body = null;
  try { body = await res.json(); } catch (_) {}
  if (!res.ok) {
    const message = body?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

/* ---------- auth screen ---------- */

function initAuthTabs() {
  $all(".auth-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      $all(".auth-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.dataset.tab;
      $("#login-form").hidden = target !== "login";
      $("#register-form").hidden = target !== "register";
    });
  });
}

async function handleLogin(e) {
  e.preventDefault();
  const form = e.target;
  const errEl = $("#login-error");
  const btn = $("#login-submit");
  errEl.hidden = true;
  const data = Object.fromEntries(new FormData(form));
  btn.disabled = true;
  btn.textContent = "Logging in…";
  try {
    const result = await api("/auth/login", { method: "POST", body: JSON.stringify(data) });
    state.user = result.user;
    enterApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Log in";
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const form = e.target;
  const errEl = $("#register-error");
  const btn = $("#register-submit");
  errEl.hidden = true;
  const data = Object.fromEntries(new FormData(form));
  btn.disabled = true;
  btn.textContent = "Creating account…";
  try {
    const result = await api("/auth/register", { method: "POST", body: JSON.stringify(data) });
    state.user = result.user;
    enterApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Create account";
  }
}

async function handleLogout() {
  try { await api("/auth/logout", { method: "POST" }); } catch (_) {}
  state.user = null;
  state.accounts = [];
  state.transactions = [];
  state.contacts = [];
  $("#app-shell").hidden = true;
  $("#auth-screen").hidden = false;
}

/* ---------- app shell ---------- */

function enterApp() {
  $("#auth-screen").hidden = true;
  $("#app-shell").hidden = false;
  $("#rail-user-name").textContent = state.user.name;
  $("#rail-user-email").textContent = state.user.email;
  loadAccounts();
}

function initNav() {
  $all(".rail-link").forEach(link => {
    link.addEventListener("click", () => {
      $all(".rail-link").forEach(l => l.classList.remove("active"));
      link.classList.add("active");
      $all(".view").forEach(v => v.classList.remove("active"));
      $(`#view-${link.dataset.view}`).classList.add("active");
      
      if (link.dataset.view === "ledger") loadLedger();
      if (link.dataset.view === "transfer") {
        fillTransferAccounts();
        fetchFriends(); // Ensure friend list is fresh when opening transfer tab
      }
    });
  });
}

/* ---------- accounts ---------- */

async function loadAccounts() {
  try {
    const { accounts } = await api("/accounts");
    const withBalances = await Promise.all(
      accounts.map(async a => {
        try {
          const { balance } = await api(`/accounts/balance/${a._id}`);
          return { ...a, balance };
        } catch (_) {
          return { ...a, balance: null };
        }
      })
    );
    state.accounts = withBalances;
    renderAccounts();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderAccounts() {
  const list = $("#accounts-list");
  const empty = $("#accounts-empty");
  list.innerHTML = "";
  empty.hidden = state.accounts.length > 0;

  state.accounts.forEach(acc => {
    const card = document.createElement("div");
    card.className = "account-card";
    const statusClass = acc.status === "FROZEN" || acc.status === "CLOSED" ? "frozen" : "";
    card.innerHTML = `
      <span class="status ${statusClass}">${acc.status}</span>
      <div class="balance">${acc.balance === null ? "—" : money(acc.balance)}<span class="currency">${acc.currency}</span></div>
      <div class="id" title="Click to copy">${acc._id}</div>
    `;
    card.querySelector(".id").addEventListener("click", () => {
      navigator.clipboard.writeText(acc._id);
      showToast("Account ID copied");
    });
    list.appendChild(card);
  });
}

async function createAccount() {
  try {
    await api("/accounts", { method: "POST" });
    closeModal();
    showToast("Account opened");
    loadAccounts();
  } catch (err) {
    showToast(err.message, true);
  }
}

/* ---------- modal: new account ---------- */

function openModal() { $("#modal-backdrop").hidden = false; }
function closeModal() { $("#modal-backdrop").hidden = true; }

/* ---------- modal: request funds ---------- */

function openFundsModal() {
  if (state.accounts.length === 0) {
    showToast("Open an account first", true);
    return;
  }
  const select = $("#funds-account");
  select.innerHTML = state.accounts
    .filter(a => a.status === "ACTIVE")
    .map(a => `<option value="${a._id}">Account ${a._id.slice(-6)}</option>`)
    .join("");
  $("#funds-error").hidden = true;
  $("#funds-form").reset();
  $("#funds-modal-backdrop").hidden = false;
}

function closeFundsModal() { $("#funds-modal-backdrop").hidden = true; }

async function handleRequestFunds(e) {
  e.preventDefault();
  const errEl = $("#funds-error");
  const btn = $("#funds-submit");
  errEl.hidden = true;
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  data.amount = Number(data.amount);
  data.idempotencyKey = crypto.randomUUID();

  btn.disabled = true;
  btn.textContent = "Requesting…";
  try {
    await api("/transactions/request-funds", { method: "POST", body: JSON.stringify(data) });
    showToast("Funds added to your account");
    closeFundsModal();
    loadAccounts();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Request";
  }
}

/* ---------- transfer ---------- */

function fillTransferAccounts() {
  const select = $("#transfer-from");
  select.innerHTML = state.accounts
    .filter(a => a.status === "ACTIVE")
    .map(a => `<option value="${a._id}">${a._id.slice(-6)} — ${money(a.balance ?? 0)} ${a.currency}</option>`)
    .join("");
}

async function handleTransfer(e) {
  e.preventDefault();
  const errEl = $("#transfer-error");
  const btn = $("#transfer-submit");
  errEl.hidden = true;
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  data.amount = Number(data.amount);
  data.idempotencyKey = crypto.randomUUID();

  btn.disabled = true;
  btn.textContent = "Sending…";
  try {
    await api("/transactions/create", { method: "POST", body: JSON.stringify(data) });
    showToast("Transfer completed");
    form.reset();
    loadAccounts();
    // Refresh peer history if looking at the friend we just sent money to
    const peerName = $("#history-friend-name").textContent.split("'s")[0];
    if (peerName && !$("#friend-history-container").hidden) {
       fetchPeerTransactions(peerName, data.toAccount);
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Send transfer";
  }
}

/* ---------- friends & peer history ---------- */

async function fetchFriends() {
  try {
    const data = await api("/accounts/contacts");
    state.contacts = data.contacts || [];
    renderFriends(state.contacts);
  } catch (err) {
    console.error("Failed to fetch friends", err);
  }
}

function renderFriends(contacts) {
  const listContainer = $("#friend-list-container");
  if (!listContainer) return;
  listContainer.innerHTML = "";

  if (contacts.length === 0) {
    listContainer.innerHTML = "<p style='color: #6b7280; font-size: 0.9rem;'>No friends found.</p>";
    return;
  }

  contacts.forEach(contact => {
    const card = document.createElement("div");
    card.className = "friend-card";
    card.innerHTML = `
      <div class="friend-name">${contact.name}</div>
      <div class="friend-id">${contact.accountId}</div>
    `;
    card.onclick = () => selectFriend(contact.name, contact.accountId);
    listContainer.appendChild(card);
  });
}

function selectFriend(name, accountId) {
  // Target the input name field of the existing transfer form
  const transferInput = document.querySelector("input[name='toAccount']") || $("#toAccount");
  if (transferInput) {
    transferInput.value = accountId;
  }
  fetchPeerTransactions(name, accountId);
}

async function fetchPeerTransactions(name, peerId) {
  try {
    $("#friend-list-container").hidden = true;
    $("#search-friend-input").hidden = true;
    $("#friend-history-container").hidden = false;
    $("#history-friend-name").textContent = `${name}'s History`;

    const historyList = $("#friend-history-list");
    historyList.innerHTML = "<p>Loading...</p>";

    const data = await api(`/transactions/peer/${peerId}`);
    const txs = data.transactions || [];

    historyList.innerHTML = "";

    if (txs.length === 0) {
      historyList.innerHTML = "<p style='color: #6b7280; font-size: 0.9rem;'>No previous transactions.</p>";
      return;
    }

    txs.forEach(tx => {
      const isReceived = tx.fromAccount === peerId;
      const item = document.createElement("div");
      item.className = `history-item ${isReceived ? 'received' : 'sent'}`;
      const dateStr = new Date(tx.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>${isReceived ? 'Received from' : 'Sent to'} ${name}</strong>
            <div style="font-size: 0.8rem; color: #6b7280;">${dateStr} &bull; ${tx.status}</div>
          </div>
          <div style="font-weight: bold; color: ${isReceived ? '#10b981' : '#ef4444'};">
            ${isReceived ? '+' : '-'}₹${money(tx.amount)}
          </div>
        </div>
      `;
      historyList.appendChild(item);
    });
  } catch (err) {
    showToast("Failed to fetch peer history", true);
  }
}

async function handleAddFriend() {
  const nameInput = $("#new-friend-name");
  const idInput = $("#new-friend-id");
  const btn = $("#btn-add-friend");

  if (!nameInput.value || !idInput.value) {
    return showToast("Please enter both a name and an Account ID", true);
  }

  btn.textContent = "Adding...";
  btn.disabled = true;

  try {
    await api("/accounts/contacts/add", {
      method: "POST",
      body: JSON.stringify({ name: nameInput.value, accountId: idInput.value })
    });
    showToast("Friend added!");
    nameInput.value = "";
    idInput.value = "";
    fetchFriends();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.textContent = "Add";
    btn.disabled = false;
  }
}

/* ---------- ledger ---------- */

async function loadLedger() {
  fillLedgerFilter();
  try {
    const { transactions } = await api("/transactions");
    state.transactions = transactions || [];
    renderLedger();
  } catch (err) {
    showToast(err.message, true);
  }
}

function fillLedgerFilter() {
  const select = $("#ledger-account-filter");
  const current = select.value;
  select.innerHTML = `<option value="all">All accounts</option>` +
    state.accounts.map(a => `<option value="${a._id}">Account ${a._id.slice(-6)}</option>`).join("");
  if (current) select.value = current;
}

function renderLedger() {
  const body = $("#statement-body");
  const empty = $("#ledger-empty");
  const filter = $("#ledger-account-filter").value || "all";

  const rows = state.transactions.filter(t => {
    if (filter === "all") return true;
    return t.fromAccount === filter || t.toAccount === filter;
  });

  empty.hidden = rows.length > 0;
  body.innerHTML = rows.map(t => {
    const isDebit = filter !== "all" ? t.fromAccount === filter : true;
    const date = new Date(t.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const pillClass = `pill-${t.status.toLowerCase()}`;
    return `
      <tr>
        <td>${date}</td>
        <td class="ref">${t._id.slice(-8)}</td>
        <td><span class="pill ${pillClass}">${t.status}</span></td>
        <td class="num debit">${isDebit ? money(t.amount) : ""}</td>
        <td class="num credit">${isDebit ? "" : money(t.amount)}</td>
      </tr>
    `;
  }).join("");
}

/* ---------- boot ---------- */

function init() {
  initAuthTabs();
  initNav();

  $("#login-form").addEventListener("submit", handleLogin);
  $("#register-form").addEventListener("submit", handleRegister);
  $("#logout-btn").addEventListener("click", handleLogout);
  $("#new-account-btn").addEventListener("click", openModal);
  $("#modal-cancel").addEventListener("click", closeModal);
  $("#modal-confirm").addEventListener("click", createAccount);
  $("#request-funds-btn").addEventListener("click", openFundsModal);
  $("#funds-cancel").addEventListener("click", closeFundsModal);
  $("#funds-form").addEventListener("submit", handleRequestFunds);
  $("#transfer-form").addEventListener("submit", handleTransfer);
  $("#ledger-account-filter").addEventListener("change", renderLedger);
  
  // Friend List Listeners
  const btnAddFriend = $("#btn-add-friend");
  if (btnAddFriend) btnAddFriend.addEventListener("click", handleAddFriend);

  const searchInput = $("#search-friend-input");
  if (searchInput) searchInput.addEventListener("keyup", (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filtered = state.contacts.filter(c => c.name.toLowerCase().includes(searchTerm));
    renderFriends(filtered);
  });

  const btnBackFriends = $("#btn-back-to-friends");
  if (btnBackFriends) btnBackFriends.addEventListener("click", () => {
    $("#friend-history-container").hidden = true;
    $("#friend-list-container").hidden = false;
    $("#search-friend-input").hidden = false;
  });
}

document.addEventListener("DOMContentLoaded", init);