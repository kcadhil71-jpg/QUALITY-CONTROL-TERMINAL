const SUPABASE_URL = "https://gjwifmyjwwvjakqnrhux.supabase.co";
const SUPABASE_ANON = "sb_publishable_cjpMcyGOGSj0fSUPeVbmGw_tLypvZCv";

const dom = {
  page: document.querySelector(".page"),
  sidebar: document.getElementById("sidebar"),
  statusText: document.getElementById("statusText"),
  refreshBtn: document.getElementById("refreshBtn"),
  menuBtn: document.getElementById("menuBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  filterStart: document.getElementById("filterStart"),
  filterEnd: document.getElementById("filterEnd"),
  filterOutlet: document.getElementById("filterOutlet"),
  filterFlow: document.getElementById("filterFlow"),
  pageTitle: document.getElementById("pageTitle"),
  pageSubtitle: document.getElementById("pageSubtitle"),
  sections: document.querySelectorAll(".section"),
  navItems: document.querySelectorAll(".nav-item[data-section]"),
  audit: {
    missing: document.getElementById("missingSubcategoryTable"),
    rectified: document.getElementById("rectifiedTable"),
    duplicates: document.getElementById("duplicateTable"),
    supplier: document.getElementById("supplierDuplicateTable"),
  },
  report: {
    sales: document.getElementById("salesTable"),
    expenses: document.getElementById("expensesTable"),
    opexCategory: document.getElementById("opexCategoryTable"),
    opexSubcategory: document.getElementById("opexSubcategoryTable"),
    opexDescription: document.getElementById("opexDescriptionTable"),
  },
};

const state = {
  supabase: null,
  outlets: [],
  filters: {
    start: "",
    end: "",
    outlet: "",
    flow: "all",
  },
  audit: {
    missing: [],
    rectified: [],
    duplicates: [],
    supplier: [],
  },
  report: {
    salesTxns: [],
    expensesTxns: [],
    salesSort: { field: "date", asc: false },
    expensesSort: { field: "date", asc: false },
    opexCategories: [],
    opexSubcategories: [],
    opexDescriptions: [],
    opexSort: {
      categories: { asc: false },
      subcategories: { asc: false },
      descriptions: { asc: false },
    },
  },
};

const pad2 = (n) => String(n).padStart(2, "0");
const toISODateLocal = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const normalize = (value) => (value || "").toString().trim().toLowerCase();
const normalizeKey = (value) => normalize(value).replace(/\s+/g, " ");

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("en-IN", { style: "currency", currency: "INR" });

const formatFullDate = (dateString) => {
  if (!dateString) return "";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const debounce = (fn, delay = 250) => {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

const groupBy = (list, keyFn) => {
  const map = new Map();
  list.forEach((item) => {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  });
  return map;
};

const buildAuditDetail = (t) => {
  const parts = [
    t.subcategory_name || "No subcategory",
    t.description || "No description",
    t.outlet_name || "No outlet",
    t.transaction_type,
  ];
  return parts.filter(Boolean).join(" • ");
};

const createAuditHeader = () => {
  const header = document.createElement("div");
  header.className = "table-row header";
  header.innerHTML = `
    <span></span>
    <span>ID</span>
    <span>Category</span>
    <span>Detail</span>
    <span>Amount</span>
    <span>Date</span>
    <span>Status</span>
  `;
  return header;
};

const createAuditRow = ({ colorClass, tooltip, id, category, detail, amount, date, statusLabel }) => {
  const row = document.createElement("div");
  row.className = `table-row ${colorClass}`;
  row.innerHTML = `
    <span class="info-icon" title="${tooltip}">i</span>
    <span>${id}</span>
    <span title="${category}">${category}</span>
    <span title="${detail}">${detail}</span>
    <span>${formatCurrency(amount)}</span>
    <span>${date}</span>
    <span><span class="badge">${statusLabel}</span></span>
  `;
  return row;
};

const sortRedFirst = (rows) => {
  return [...rows].sort((a, b) => {
    const aRed = a.colorClass === "row-red" ? 1 : 0;
    const bRed = b.colorClass === "row-red" ? 1 : 0;
    if (aRed !== bRed) return bRed - aRed;
    return 0;
  });
};

const renderAuditTable = (element, rows) => {
  element.innerHTML = "";
  element.appendChild(createAuditHeader());
  const sortedRows = sortRedFirst(rows);
  if (!sortedRows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No entries found.";
    element.appendChild(empty);
    return;
  }
  sortedRows.forEach((row) => element.appendChild(createAuditRow(row)));
};

const exportAuditCSV = (rows, filename) => {
  if (!rows.length) return;
  const header = ["id", "category", "detail", "amount", "date", "status"];
  const lines = [header, ...rows.map((row) => [
    row.id,
    row.category,
    row.detail,
    row.amount,
    row.date,
    row.statusLabel,
  ])];
  const csv = lines
    .map((line) => line.map((cell) => `"${String(cell ?? "").replace(/\"/g, "\"\"")}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const exportAuditXLSX = (rows, filename) => {
  if (!rows.length || !window.XLSX) return;
  const data = rows.map((row) => ({
    ID: row.id,
    Category: row.category,
    Detail: row.detail,
    Amount: row.amount,
    Date: row.date,
    Status: row.statusLabel,
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const range = XLSX.utils.decode_range(worksheet["!ref"]);

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const row = rows[r - 1];
    const fgColor =
      row.colorClass === "row-red"
        ? "FFFF5D5D"
        : row.colorClass === "row-yellow"
        ? "FFF4B400"
        : "FF42F5A1";
    const fill = { patternType: "solid", fgColor: { rgb: fgColor } };
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.s = { fill };
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Audit");
  XLSX.writeFile(workbook, filename, { bookType: "xlsx", cellStyles: true });
};

const exportReportCSV = (transactions, filename) => {
  if (!transactions.length) return;
  const header = ["date", "outlet", "category", "subcategory", "description", "payment_method", "amount"];
  const lines = [header, ...transactions.map((t) => [
    t.date,
    t.outlet_name || "",
    t.category_name || "",
    t.subcategory_name || "",
    t.description || "",
    t.payment_method || "",
    t.amount,
  ])];
  const csv = lines
    .map((line) => line.map((cell) => `"${String(cell ?? "").replace(/\"/g, "\"\"")}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const exportReportXLSX = (transactions, sheetName, filename) => {
  if (!transactions.length || !window.XLSX) return;
  const data = transactions.map((t) => ({
    Date: t.date,
    Outlet: t.outlet_name || "",
    Category: t.category_name || "",
    Subcategory: t.subcategory_name || "",
    Description: t.description || "",
    "Payment Method": t.payment_method || "",
    Amount: t.amount,
  }));
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename, { bookType: "xlsx", cellStyles: true });
};

const analyzeDuplicates = (transactions) => {
  const keyFn = (t) =>
    [
      normalizeKey(t.category_name),
      normalizeKey(t.subcategory_name),
      Number(t.amount || 0).toFixed(2),
      normalize(t.transaction_type),
    ].join("|");
  const grouped = groupBy(transactions, keyFn);

  const results = [];
  grouped.forEach((items) => {
    if (items.length < 2) return;
    const dateMap = groupBy(items, (t) => t.date);

    items.forEach((t) => {
      const exactMatch = (dateMap.get(t.date) || []).length > 1;
      const colorClass = exactMatch ? "row-red" : "row-yellow";
      const statusLabel = exactMatch ? "Exact duplicate" : "Date mismatch";
      const tooltip = exactMatch
        ? "Exact match on date, category, subcategory, amount, and flow"
        : "Same category, subcategory, amount, and flow. Date mismatch.";

      results.push({
        colorClass,
        tooltip,
        id: t.id,
        category: t.category_name || "Unknown",
        detail: buildAuditDetail(t),
        amount: t.amount,
        date: t.date,
        statusLabel,
      });
    });
  });
  return results.sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)));
};

const analyzeSupplierDuplicates = (transactions) => {
  const supplierTxns = transactions.filter((t) => normalizeKey(t.category_name) === "supplier");
  const keyFn = (t) => {
    const amount = Number(t.amount || 0);
    return [normalizeKey(t.subcategory_name), amount.toFixed(2)].join("|");
  };
  const grouped = groupBy(supplierTxns, keyFn);

  const results = [];
  grouped.forEach((items) => {
    if (items.length < 2) return;
    const dateMap = groupBy(items, (t) => t.date);

    items.forEach((t) => {
      const exactMatch = (dateMap.get(t.date) || []).length > 1;
      const colorClass = exactMatch ? "row-red" : "row-yellow";
      const statusLabel = exactMatch ? "Exact duplicate" : "Date mismatch";
      const tooltip = exactMatch
        ? "Same date, subcategory, and amount for supplier payments"
        : "Same subcategory and amount, date mismatch";

      results.push({
        colorClass,
        tooltip,
        id: t.id,
        category: t.category_name || "Supplier",
        detail: `${t.subcategory_name || "No subcategory"} • supplier payment`,
        amount: t.amount,
        date: t.date,
        statusLabel,
      });
    });
  });
  return results.sort((a, b) => (a.date === b.date ? b.id - a.id : b.date.localeCompare(a.date)));
};

const sortByDateOutlet = (transactions, sort) => {
  const { field, asc } = sort;
  const safeOutlet = (t) => (t.outlet_name || "").toString();
  const safeId = (t) => Number(t.id || 0);
  const sorted = [...transactions].sort((a, b) => {
    if (field === "amount") {
      if (a.amount === b.amount) return safeId(a) - safeId(b);
      return asc ? a.amount - b.amount : b.amount - a.amount;
    }
    if (a.date === b.date) {
      const outletComp = safeOutlet(a).localeCompare(safeOutlet(b));
      if (outletComp !== 0) return outletComp;
      return safeId(a) - safeId(b);
    }
    return asc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  });
  return sorted;
};

const renderReportTable = (element, transactions, { sortState, onToggleDate, onToggleAmount, labels }) => {
  element.innerHTML = "";

  const header = document.createElement("div");
  header.className = "rrow header";

  const dateCell = document.createElement("span");
  const dateBtn = document.createElement("button");
  dateBtn.type = "button";
  dateBtn.className = "sort-btn";
  dateBtn.innerHTML = `Date <span class=\"sort-arrow\">${sortState.field === "date" && sortState.asc ? "▲" : "▼"}</span>`;
  dateBtn.addEventListener("click", onToggleDate);
  dateCell.appendChild(dateBtn);

  const h = (text) => {
    const span = document.createElement("span");
    span.textContent = text;
    return span;
  };

  header.appendChild(dateCell);
  header.appendChild(h("Location"));
  header.appendChild(h("Category"));
  header.appendChild(h(labels?.subheading || "Subcategory"));
  header.appendChild(h(labels?.description || "Description"));
  header.appendChild(h(labels?.type || "Txn Type"));
  const amountCell = document.createElement("span");
  amountCell.className = "amount-sort";
  const amountBtn = document.createElement("button");
  amountBtn.type = "button";
  amountBtn.className = "sort-btn";
  amountBtn.innerHTML = `Amount <span class=\"sort-arrow\">${sortState.field === "amount" && sortState.asc ? "▲" : "▼"}</span>`;
  amountBtn.addEventListener("click", onToggleAmount);
  amountCell.appendChild(amountBtn);
  header.appendChild(amountCell);

  element.appendChild(header);

  if (!transactions.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No entries found.";
    element.appendChild(empty);
    return;
  }

  const sorted = sortByDateOutlet(transactions, sortState);

  sorted.forEach((t) => {
    const row = document.createElement("div");
    row.className = "rrow";
    const safe = (v) => (v == null || String(v).trim() === "" ? "—" : String(v));

    row.innerHTML = `
      <span title="${t.date}">${formatFullDate(t.date)}</span>
      <span title="${safe(t.outlet_name)}">${safe(t.outlet_name)}</span>
      <span title="${safe(t.category_name)}">${safe(t.category_name)}</span>
      <span title="${safe(t.subcategory_name)}">${safe(t.subcategory_name)}</span>
      <span title="${safe(t.description)}">${safe(t.description)}</span>
      <span title="${safe(t.payment_method)}">${safe(t.payment_method)}</span>
      <span>${formatCurrency(t.amount)}</span>
    `;
    element.appendChild(row);
  });
};

const renderOpexTable = (element, rows, { onToggleAmount, sortAsc, label }) => {
  element.innerHTML = "";
  const header = document.createElement("div");
  header.className = "rrow header compact";
  const nameCell = document.createElement("span");
  nameCell.textContent = label;
  const amountCell = document.createElement("span");
  amountCell.className = "amount-sort";
  const amountBtn = document.createElement("button");
  amountBtn.type = "button";
  amountBtn.className = "sort-btn";
  amountBtn.innerHTML = `Amount <span class=\"sort-arrow\">${sortAsc ? "▲" : "▼"}</span>`;
  amountBtn.addEventListener("click", onToggleAmount);
  amountCell.appendChild(amountBtn);
  header.appendChild(nameCell);
  header.appendChild(amountCell);
  element.appendChild(header);

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No entries found.";
    element.appendChild(empty);
    return;
  }

  rows.forEach((row) => {
    const r = document.createElement("div");
    r.className = "rrow compact";
    r.innerHTML = `
      <span title="${row.label}">${row.label}</span>
      <span>${formatCurrency(row.amount)}</span>
    `;
    element.appendChild(r);
  });
};

const populateOutletFilter = (outlets) => {
  const selected = dom.filterOutlet.value || "";
  dom.filterOutlet.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "";
  allOption.textContent = "All outlets";
  dom.filterOutlet.appendChild(allOption);
  outlets.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    dom.filterOutlet.appendChild(option);
  });
  dom.filterOutlet.value = selected;
};

const readFiltersFromUI = () => ({
  start: dom.filterStart.value || "",
  end: dom.filterEnd.value || "",
  outlet: dom.filterOutlet.value || "",
  flow: dom.filterFlow.value || "all",
});

const applyFiltersToUI = (filters) => {
  dom.filterStart.value = filters.start || "";
  dom.filterEnd.value = filters.end || "";
  dom.filterFlow.value = filters.flow || "all";
  dom.filterOutlet.value = filters.outlet || "";
};

const setDefaultFilters = () => {
  // Default: all time so historical duplicates remain visible.
  state.filters = { start: "", end: "", outlet: "", flow: "all" };
  applyFiltersToUI(state.filters);
};

const setAllTimeFilters = () => {
  state.filters = { start: "", end: "", outlet: "", flow: "all" };
  applyFiltersToUI(state.filters);
};

const fetchOutlets = async () => {
  if (!state.supabase) return [];
  try {
    const { data, error } = await state.supabase.from("outlets").select("name").order("name");
    if (error) return [];
    return (data || []).map((o) => o.name).filter(Boolean);
  } catch {
    return [];
  }
};

const fetchTransactionsPaged = async (filters) => {
  const PAGE_SIZE = 1000;
  const results = [];
  for (let offset = 0; offset < 20000; offset += PAGE_SIZE) {
    let query = state.supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);

    if (filters.start) query = query.gte("date", filters.start);
    if (filters.end) query = query.lte("date", filters.end);
    if (filters.outlet) query = query.eq("outlet_name", filters.outlet);
    if (filters.flow && filters.flow !== "all") query = query.eq("transaction_type", filters.flow);

    const { data, error } = await query;
    if (error) throw error;
    results.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return results;
};

const computeAudit = (transactions) => {
  const missingTxns = transactions.filter((t) => !t.subcategory_name || String(t.subcategory_name).trim() === "");
  const missingIds = new Set(missingTxns.map((t) => t.id));
  const prevMissing = new Set(JSON.parse(localStorage.getItem("missingSubcategoryIds") || "[]"));
  const rectifiedTxns = transactions.filter(
    (t) => t.subcategory_name && String(t.subcategory_name).trim() !== "" && prevMissing.has(t.id) && !missingIds.has(t.id)
  );
  localStorage.setItem("missingSubcategoryIds", JSON.stringify([...missingIds]));

  state.audit.missing = missingTxns.map((t) => ({
    colorClass: "row-yellow",
    tooltip: "Missing subcategory",
    id: t.id,
    category: t.category_name || "Unknown",
    detail: buildAuditDetail(t),
    amount: t.amount,
    date: t.date,
    statusLabel: "Missing",
  }));

  state.audit.rectified = rectifiedTxns.map((t) => ({
    colorClass: "row-green",
    tooltip: "Subcategory present (rectified)",
    id: t.id,
    category: t.category_name || "Unknown",
    detail: buildAuditDetail(t),
    amount: t.amount,
    date: t.date,
    statusLabel: "Rectified",
  }));

  state.audit.duplicates = analyzeDuplicates(transactions);
  state.audit.supplier = analyzeSupplierDuplicates(transactions);
};

const computeReport = (transactions) => {
  state.report.salesTxns = transactions.filter(
    (t) => normalize(t.category_name) === "sales" && t.transaction_type === "inflow"
  );
  state.report.expensesTxns = transactions.filter((t) => t.transaction_type === "outflow");

  const sumBy = (list, keyFn) => {
    const map = new Map();
    list.forEach((t) => {
      const key = keyFn(t) || "Unknown";
      map.set(key, (map.get(key) || 0) + Number(t.amount || 0));
    });
    return Array.from(map.entries()).map(([label, amount]) => ({ label, amount }));
  };

  state.report.opexCategories = sumBy(state.report.expensesTxns, (t) => t.category_name)
    .sort((a, b) => b.amount - a.amount);
  state.report.opexSubcategories = sumBy(state.report.expensesTxns, (t) => t.subcategory_name)
    .sort((a, b) => b.amount - a.amount);
  state.report.opexDescriptions = sumBy(state.report.expensesTxns, (t) => t.description)
    .sort((a, b) => b.amount - a.amount);
};

const renderAudit = () => {
  renderAuditTable(dom.audit.missing, state.audit.missing);
  renderAuditTable(dom.audit.rectified, state.audit.rectified);
  renderAuditTable(dom.audit.duplicates, state.audit.duplicates);
  renderAuditTable(dom.audit.supplier, state.audit.supplier);
};

const renderReport = () => {
  renderReportTable(dom.report.sales, state.report.salesTxns, {
    sortState: state.report.salesSort,
    onToggleDate: () => {
      state.report.salesSort = { field: "date", asc: state.report.salesSort.field === "date" ? !state.report.salesSort.asc : false };
      renderReport();
    },
    onToggleAmount: () => {
      state.report.salesSort = { field: "amount", asc: state.report.salesSort.field === "amount" ? !state.report.salesSort.asc : false };
      renderReport();
    },
    labels: { subheading: "Particulars", description: "Description", type: "Txn Type" },
  });

  renderReportTable(dom.report.expenses, state.report.expensesTxns, {
    sortState: state.report.expensesSort,
    onToggleDate: () => {
      state.report.expensesSort = { field: "date", asc: state.report.expensesSort.field === "date" ? !state.report.expensesSort.asc : false };
      renderReport();
    },
    onToggleAmount: () => {
      state.report.expensesSort = { field: "amount", asc: state.report.expensesSort.field === "amount" ? !state.report.expensesSort.asc : false };
      renderReport();
    },
    labels: { subheading: "Subcategory", description: "Detailed description", type: "Txn Type" },
  });

  const opexSort = state.report.opexSort;
  const categoryRows = [...state.report.opexCategories].sort((a, b) => (opexSort.categories.asc ? a.amount - b.amount : b.amount - a.amount));
  const subcategoryRows = [...state.report.opexSubcategories].sort((a, b) => (opexSort.subcategories.asc ? a.amount - b.amount : b.amount - a.amount));
  const descriptionRows = [...state.report.opexDescriptions].sort((a, b) => (opexSort.descriptions.asc ? a.amount - b.amount : b.amount - a.amount));

  renderOpexTable(dom.report.opexCategory, categoryRows, {
    label: "Category",
    sortAsc: opexSort.categories.asc,
    onToggleAmount: () => {
      opexSort.categories.asc = !opexSort.categories.asc;
      renderReport();
    },
  });

  renderOpexTable(dom.report.opexSubcategory, subcategoryRows, {
    label: "Subcategory",
    sortAsc: opexSort.subcategories.asc,
    onToggleAmount: () => {
      opexSort.subcategories.asc = !opexSort.subcategories.asc;
      renderReport();
    },
  });

  renderOpexTable(dom.report.opexDescription, descriptionRows, {
    label: "Description",
    sortAsc: opexSort.descriptions.asc,
    onToggleAmount: () => {
      opexSort.descriptions.asc = !opexSort.descriptions.asc;
      renderReport();
    },
  });
};

const renderAll = () => {
  renderAudit();
  renderReport();
};

const load = async () => {
  const filters = readFiltersFromUI();
  state.filters = filters;
  dom.statusText.textContent = "Loading…";

  try {
    const transactions = await fetchTransactionsPaged(filters);
    console.info(`[Data] Loaded ${transactions.length} transactions`);

    if (!state.outlets.length) {
      const outlets = await fetchOutlets();
      state.outlets = outlets.length
        ? outlets
        : [...new Set(transactions.map((t) => t.outlet_name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
      populateOutletFilter(state.outlets);
      dom.filterOutlet.value = filters.outlet || "";
    }

    const expectedIds = [16, 880];
    const present = expectedIds.filter((id) => transactions.some((t) => Number(t.id) === id));
    const missing = expectedIds.filter((id) => !present.includes(id));
    if (missing.length) {
      console.warn(`[Data] Missing expected IDs in current query: ${missing.join(", ")}`);
    }

    computeAudit(transactions);
    computeReport(transactions);
    renderAll();

    dom.statusText.textContent = `Last refresh: ${new Date().toLocaleTimeString()}`;
  } catch (error) {
    console.error(error);
    dom.statusText.textContent = "Error loading data. Check console.";
  }
};

const init = async () => {
  dom.statusText.textContent = "Connecting…";
  state.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

  setDefaultFilters();

  dom.refreshBtn.addEventListener("click", load);
  dom.menuBtn.addEventListener("click", () => {
    dom.page.classList.toggle("sidebar-mini");
  });

  dom.logoutBtn.addEventListener("click", async () => {
    try {
      localStorage.removeItem("missingSubcategoryIds");
      localStorage.removeItem("authUser");
      await state.supabase.auth.signOut();
    } catch {
      // ignore
    } finally {
      window.location.reload();
    }
  });

  dom.clearFiltersBtn.addEventListener("click", () => {
    setAllTimeFilters();
    load();
  });

  const debouncedLoad = debounce(load, 350);
  dom.filterStart.addEventListener("change", debouncedLoad);
  dom.filterEnd.addEventListener("change", debouncedLoad);
  dom.filterOutlet.addEventListener("change", debouncedLoad);
  dom.filterFlow.addEventListener("change", debouncedLoad);

  document.querySelectorAll("[data-export]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-export");
      exportAuditCSV(state.audit[key] || [], `${key}_audit_${Date.now()}.csv`);
    });
  });

  document.querySelectorAll("[data-export-xlsx]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-export-xlsx");
      exportAuditXLSX(state.audit[key] || [], `${key}_audit_${Date.now()}.xlsx`);
    });
  });

  document.querySelectorAll("[data-report-export]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-report-export");
      if (key === "sales" || key === "expenses") {
        const txns = key === "sales" ? state.report.salesTxns : state.report.expensesTxns;
        const sortState = key === "sales" ? state.report.salesSort : state.report.expensesSort;
        exportReportCSV(sortByDateOutlet(txns, sortState), `${key}_report_${Date.now()}.csv`);
        return;
      }

      const rows =
        key === "opexCategories"
          ? state.report.opexCategories
          : key === "opexSubcategories"
          ? state.report.opexSubcategories
          : state.report.opexDescriptions;
      const header = ["label", "amount"];
      const lines = [header, ...rows.map((row) => [row.label, row.amount])];
      const csv = lines.map((line) => line.map((cell) => `"${String(cell ?? "").replace(/\"/g, "\"\"")}"`).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${key}_report_${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  });

  document.querySelectorAll("[data-report-export-xlsx]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-report-export-xlsx");
      if (key === "sales" || key === "expenses") {
        const txns = key === "sales" ? state.report.salesTxns : state.report.expensesTxns;
        const sortState = key === "sales" ? state.report.salesSort : state.report.expensesSort;
        exportReportXLSX(sortByDateOutlet(txns, sortState), key === "sales" ? "Sales" : "Expenses", `${key}_report_${Date.now()}.xlsx`);
        return;
      }

      const rows =
        key === "opexCategories"
          ? state.report.opexCategories
          : key === "opexSubcategories"
          ? state.report.opexSubcategories
          : state.report.opexDescriptions;
      if (!rows.length || !window.XLSX) return;
      const data = rows.map((row) => ({ Label: row.label, Amount: row.amount }));
      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "OPEX");
      XLSX.writeFile(workbook, `${key}_report_${Date.now()}.xlsx`, { bookType: "xlsx", cellStyles: true });
    });
  });

  document.querySelectorAll("[data-expand]").forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".card");
      const expanded = card.classList.toggle("expanded");
      const anyExpanded = document.querySelectorAll(".card.expanded").length > 0;
      dom.page.classList.toggle("lock-scroll", anyExpanded);
      button.textContent = expanded ? "Collapse" : "Expand";
    });
  });

  dom.navItems.forEach((item) => {
    item.addEventListener("click", () => {
      dom.navItems.forEach((btn) => btn.classList.remove("is-active"));
      item.classList.add("is-active");
      const section = item.getAttribute("data-section");
      dom.sections.forEach((panel) => {
        panel.classList.toggle("is-active", panel.id === `${section}Section`);
      });
      if (section === "audit") {
        dom.pageTitle.textContent = "Audit";
        dom.pageSubtitle.textContent = "Quality control and duplicate detection.";
      } else {
        dom.pageTitle.textContent = "Report";
        dom.pageSubtitle.textContent = "Sales and expense reporting.";
      }
    });
  });

  const loginScreen = document.getElementById("loginScreen");
  const appPage = document.getElementById("appPage");
  const loginBtn = document.getElementById("loginBtn");
  const loginStatus = document.getElementById("loginStatus");
  const loginUsername = document.getElementById("loginUsername");
  const loginPassword = document.getElementById("loginPassword");

  const showApp = async () => {
    loginScreen.classList.add("hidden");
    appPage.style.display = "block";
    await load();
  };

  const savedUser = localStorage.getItem("authUser");
  if (savedUser) {
    await showApp();
    return;
  }

  appPage.style.display = "none";
  loginStatus.textContent = "Enter credentials to continue.";

  const performLogin = async () => {
    loginStatus.textContent = "Checking...";
    const username = loginUsername.value.trim();
    const password = loginPassword.value;
    if (!username || !password) {
      loginStatus.textContent = "Username and password required.";
      return;
    }

    const { data: employees, error } = await state.supabase
      .from("employees")
      .select("username,password");

    if (error) {
      console.error(error);
      loginStatus.textContent = "Login failed. Check permissions.";
      return;
    }

    const match = (employees || []).find(
      (emp) => String(emp.username).toLowerCase() === username.toLowerCase() && String(emp.password) === password
    );

    if (!match) {
      loginStatus.textContent = "Invalid credentials.";
      return;
    }

    localStorage.setItem("authUser", match.username);
    await showApp();
  };

  loginBtn.addEventListener("click", performLogin);
  loginPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") performLogin();
  });
};

window.addEventListener("DOMContentLoaded", init);

