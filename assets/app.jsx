function getHashPath() {
  const raw = window.location.hash || "#/";
  const hash = raw.startsWith("#") ? raw.slice(1) : raw;
  return hash.startsWith("/") ? hash : "/" + hash;
}

function useHashPath() {
  const [path, setPath] = React.useState(getHashPath());

  React.useEffect(() => {
    const onChange = () => setPath(getHashPath());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  return path;
}

function navigateTo(path) {
  const normalized = path.startsWith("/") ? path : "/" + path;
  window.location.hash = normalized;
}

function Link({ to, className, children }) {
  const href = "#" + (to.startsWith("/") ? to : "/" + to);
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        // keep default behavior for new tab / modifiers
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigateTo(to);
      }}
    >
      {children}
    </a>
  );
}

function getRoute(path) {
  // routes:
  // - "/" => home
  // - "/product/:name" => detail (name is URI encoded)
  if (path === "/" || path === "") return { name: "home" };
  if (path.startsWith("/product/")) {
    const encodedName = path.slice("/product/".length);
    return { name: "product", encodedName };
  }
  return { name: "notfound" };
}

function toNumberOrNull(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toBoolFlag(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y" || s === "t";
}

function parseDateOrNull(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function isWithinLastDays(dateValue, days) {
  const d = parseDateOrNull(dateValue);
  if (!d) return false;
  const now = Date.now();
  const ms = now - d.getTime();
  if (ms < 0) return true; // future date: treat as new
  return ms <= days * 24 * 60 * 60 * 1000;
}

function formatJPY(n) {
  const num = toNumberOrNull(n);
  if (num == null) return null;
  return "¥ " + Math.round(num).toLocaleString("ja-JP");
}

function formatTWDFromJPY(jpy, rate) {
  const j = toNumberOrNull(jpy);
  const r = toNumberOrNull(rate);
  if (j == null || r == null) return null;
  return "NT$" + Math.round(j * r).toLocaleString("zh-TW");
}

const API_URL =
  "https://script.googleusercontent.com/macros/echo?user_content_key=AY5xjrTS-qEphaiBZpDtZQiI4E_L4Ge4iew16KNpZjrnxlTW9Un0pCjTYDgyjxahCWPMth1rKbw4LC2adRlvAfht8Yjg7lZHaSNf2S-SriWDDtPkvZ0ZAn44OhpAap08hwkyQnBZgk4So2daHtOKP07hH3WXCLBCTE0KweDPxOqKTj3iuBwAcZ3A6a2yB3lhKShH_c4yHGiNFo8kDU6geRbf5a0XtAG5j6s2v3vrQw-ebi9metYny89Q59EvXqqNicsMMaWcLpxHBU26yHqiKu9XQ0GZLvMhgA&lib=MCN1sfGqsjw8Wsi0FJVsTJbQ42JGSsI5e";

function normalizeItem(row, index) {
  if (!row || typeof row !== "object") return null;

  const id = row.id ?? row.ID ?? row.序號 ?? row.編號 ?? String(index + 1);
  const name = row.name ?? row.商品名稱 ?? row.title ?? row.品名 ?? "";
  const rawPrice =
    row.price ??
    row.價格 ??
    row.priceTWD ??
    row.Price ??
    row["日幣價格"] ??
    null;
  const price = toNumberOrNull(rawPrice);
  const image =
    row.image ??
    row.圖片 ??
    row.imageUrl ??
    row.Image ??
    row["圖片URL"] ??
    "";
  const description =
    row.description ?? row.描述 ?? row.說明 ?? row.content ?? "";
  const introduction =
    row.introduction ??
    row.商品介紹 ??
    row.介紹 ??
    row.intro ??
    "";
  const variant = row.variant ?? row.規格 ?? row.顏色 ?? row.option ?? "";
  const category = row.category ?? row.分類 ?? "";
  const isHot = toBoolFlag(row.hot ?? row.熱銷);
  const isRecommended = toBoolFlag(row.recommended ?? row.推薦);
  const publishedAt = row.publishedAt ?? row.上架日期 ?? row.上架時間 ?? null;
  const isNewByFlag = toBoolFlag(row.isNew ?? row.新品);
  const isNewByDate = isWithinLastDays(publishedAt, 7);
  const isNew = isNewByFlag || isNewByDate;

  const sku = [name, variant, price ?? ""].join("||");

  return {
    raw: row,
    id,
    sku,
    name,
    price,
    image,
    description,
    introduction,
    variant,
    category,
    isHot,
    isRecommended,
    isNew,
    publishedAt,
  };
}

function useProducts() {
  const [products, setProducts] = React.useState([]);
  const [rate, setRate] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        // IMPORTANT: do NOT send custom headers here.
        // Custom headers trigger CORS preflight (OPTIONS), and Google Script often doesn't reply with CORS headers for OPTIONS.
        const res = await fetch(API_URL, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP error " + res.status);

        const data = await res.json();
        console.log("Raw API data:", data);

        const apiRate = toNumberOrNull(data?.rate);
        if (!cancelled) setRate(apiRate);

        const rows = Array.isArray(data)
          ? data
          : Array.isArray(data?.products)
          ? data.products
          : Array.isArray(data?.data)
          ? data.data
          : [];

        const normalized = rows
          .map((row, idx) => normalizeItem(row, idx))
          .filter((x) => x && x.name);

        if (!cancelled) setProducts(normalized);
      } catch (err) {
        console.error("Fetch error:", err);
        if (!cancelled) setError(err?.message || "無法載入商品資料");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  return { products, rate, loading, error };
}

function getUniqueProductsByName(products) {
  const seen = new Set();
  const result = [];
  for (const p of products) {
    if (!p?.name) continue;
    if (seen.has(p.name)) continue;
    seen.add(p.name);
    result.push(p);
  }
  return result;
}

function Navbar({ cartCount, onOpenCart }) {
  return (
    <header className="sticky top-0 z-20 bg-white/80 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-4 grid grid-cols-[1fr_auto_1fr] items-center">
        <div />

        <Link
          to="/"
          className="flex items-center space-x-2 justify-center transition-transform duration-150 hover:opacity-90 active:scale-95"
        >
          <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-900 flex items-center justify-center">
            <img
              src="./品牌logo_tondiv.jpg"
              alt="Maaru 品牌 Logo"
              className="w-full h-full object-contain"
              loading="lazy"
            />
          </div>
          <div className="flex flex-col leading-tight text-left">
            <span className="text-sm font-semibold tracking-[0.2em] uppercase">
              Maaru
            </span>
            <span className="text-xs text-slate-500 tracking-[0.15em] uppercase">
              Select Shop
            </span>
          </div>
        </Link>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onOpenCart}
            className="relative inline-flex items-center justify-center w-11 h-11 rounded-full border border-slate-200 bg-white hover:border-slate-900 transition-colors"
            aria-label="開啟購物車"
          >
            <span className="text-base">🛒</span>
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-slate-900 text-white text-[10px] leading-5 text-center">
                {cartCount > 99 ? "99+" : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

function ProductCard({ product, rate }) {
  const twd = formatTWDFromJPY(product.price, rate);

  const encodedName = encodeURIComponent(product.name);

  return (
    <Link
      to={`/product/${encodedName}`}
      className="product-card group block bg-white rounded-2xl overflow-hidden border border-slate-200 hover:border-slate-900 transition-colors duration-200"
    >
      <div className="scan-target relative aspect-[4/5] bg-slate-100 overflow-hidden">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
            No Image
          </div>
        )}

        {product.isHot || product.isRecommended || product.isNew ? (
          <div className="absolute top-3 left-3 flex flex-wrap gap-1">
            {product.isHot ? (
              <span className="text-[11px] px-2 py-1 rounded-full bg-rose-600 text-white shadow-sm">
                熱銷
              </span>
            ) : null}
            {product.isRecommended ? (
              <span className="text-[11px] px-2 py-1 rounded-full bg-indigo-600 text-white shadow-sm">
                推薦
              </span>
            ) : null}
            {product.isNew ? (
              <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-600 text-white shadow-sm">
                新品
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="p-4 space-y-1">
        <h2 className="text-sm font-medium text-slate-900 line-clamp-2">
          {product.name}
        </h2>
        <div className="pt-1">
          {twd ? (
            <p className="text-sm text-slate-900">{twd}</p>
          ) : (
            <p className="text-sm text-slate-500">價格請洽詢</p>
          )}
        </div>
      </div>
    </Link>
  );
}

function HomePage({ products, rate, loading, error }) {
  const CATEGORY_KEY = "maarushop_home_category_v1";
  const SEARCH_KEY = "maarushop_home_search_v1";
  const SORT_KEY = "maarushop_home_sort_v1";
  const [selectedCategory, setSelectedCategory] = React.useState(() => {
    try {
      return localStorage.getItem(CATEGORY_KEY) || "ALL";
    } catch {
      return "ALL";
    }
  });

  const [search, setSearch] = React.useState(() => {
    try {
      return localStorage.getItem(SEARCH_KEY) || "";
    } catch {
      return "";
    }
  });

  const [sortMode, setSortMode] = React.useState(() => {
    try {
      return localStorage.getItem(SORT_KEY) || "none";
    } catch {
      return "none";
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(CATEGORY_KEY, selectedCategory);
    } catch {
      // ignore
    }
  }, [selectedCategory]);

  React.useEffect(() => {
    try {
      localStorage.setItem(SEARCH_KEY, search);
    } catch {
      // ignore
    }
  }, [search]);

  React.useEffect(() => {
    try {
      localStorage.setItem(SORT_KEY, sortMode);
    } catch {
      // ignore
    }
  }, [sortMode]);

  const categories = React.useMemo(() => {
    const set = new Set();
    for (const p of products) {
      const c = (p?.category || "").trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [products]);

  // If category disappears after data refresh, reset to ALL
  React.useEffect(() => {
    if (selectedCategory === "ALL") return;
    if (categories.includes(selectedCategory)) return;
    setSelectedCategory("ALL");
  }, [categories, selectedCategory]);

  const filteredProducts = React.useMemo(() => {
    let result = products;
    if (selectedCategory !== "ALL") {
      result = result.filter(
        (p) => (p?.category || "").trim() === selectedCategory
      );
    }
    const q = search.trim().toLowerCase();
    if (!q) return result;

    return result.filter((p) => {
      const name = (p?.name || "").toLowerCase();
      const variant = (p?.variant || "").toLowerCase();
      return name.includes(q) || variant.includes(q);
    });
  }, [products, selectedCategory, search]);

  const uniqueProducts = React.useMemo(() => {
    const base = getUniqueProductsByName(filteredProducts);
    if (sortMode === "none") return base;

    const arr = base.slice();
    arr.sort((a, b) => {
      const pa = toNumberOrNull(a?.price);
      const pb = toNumberOrNull(b?.price);
      if (pa == null && pb == null) return 0;
      if (pa == null) return 1;
      if (pb == null) return -1;
      return sortMode === "price_asc" ? pa - pb : pb - pa;
    });
    return arr;
  }, [filteredProducts, sortMode]);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      {!loading && !error && (
        <div className="mb-6 space-y-3">
          {categories.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-800 tracking-[0.25em] uppercase">
                  Category
                </p>
              </div>
              <div className="flex gap-2 overflow-auto pb-1">
                <button
                  type="button"
                  onClick={() => setSelectedCategory("ALL")}
                  className={[
                    "shrink-0 text-xs px-3.5 py-2 rounded-full border transition-colors whitespace-nowrap",
                    selectedCategory === "ALL"
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-700 border-slate-200 hover:border-slate-900",
                  ].join(" ")}
                >
                  全部
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCategory(c)}
                    className={[
                      "shrink-0 text-xs px-3.5 py-2 rounded-full border transition-colors whitespace-nowrap",
                      selectedCategory === c
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-white text-slate-700 border-slate-200 hover:border-slate-900",
                    ].join(" ")}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xs sm:max-w-sm">
              <label className="block mb-1 text-xs font-semibold text-slate-800 tracking-[0.25em] uppercase">
                Search
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜尋商品名稱或規格…"
                  className="w-full rounded-full border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900 focus:border-slate-900"
                />
              </div>
            </div>

            <div className="sm:text-right">
              <label className="block mb-1 text-xs font-semibold text-slate-800 tracking-[0.25em] uppercase">
                Sort
              </label>
              <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSortMode("none")}
                  className={[
                    "px-3 py-1 rounded-full",
                    sortMode === "none"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                >
                  預設
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode("price_asc")}
                  className={[
                    "px-3 py-1 rounded-full",
                    sortMode === "price_asc"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                >
                  價格 低→高
                </button>
                <button
                  type="button"
                  onClick={() => setSortMode("price_desc")}
                  className={[
                    "px-3 py-1 rounded-full",
                    sortMode === "price_desc"
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100",
                  ].join(" ")}
                >
                  價格 高→低
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <div className="flex flex-col items-center space-y-3 text-slate-500 text-sm">
            <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-900 rounded-full animate-spin" />
            <span>載入商品中...</span>
          </div>
        </div>
      )}

      {error && (
        <div className="max-w-md mx-auto mb-6 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <p className="font-medium mb-1">載入失敗</p>
          <p className="mb-1">{error}</p>
          <p className="text-xs text-red-500">
            請稍後重試，並在瀏覽器主控台查看錯誤訊息。
          </p>
        </div>
      )}

      {!loading && !error && uniqueProducts.length === 0 && (
        <p className="text-center text-sm text-slate-500">
          目前沒有可顯示的商品。
        </p>
      )}

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
        {uniqueProducts.map((p) => (
          <ProductCard key={p.id || p.name} product={p} rate={rate} />
        ))}
      </section>
    </main>
  );
}

function ProductDetailPage({ products, rate, encodedName, onAddToCart }) {
  const decodedName = decodeURIComponent(encodedName || "");

  const group = React.useMemo(() => {
    return products.filter((p) => p.name === decodedName);
  }, [products, decodedName]);

  if (!decodedName) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => history.back()}
          className="inline-flex items-center gap-1.5 text-xs mb-4 px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 hover:border-slate-900 hover:text-slate-900 bg-white shadow-sm transition-colors"
        >
          <span className="text-sm">←</span>
          <span>返回列表</span>
        </button>
        <p className="text-sm text-slate-500">找不到此商品。</p>
      </main>
    );
  }

  const mainProduct = group[0];
  const [selectedSku, setSelectedSku] = React.useState(null);

  React.useEffect(() => {
    if (!group?.length) return;
    setSelectedSku((prev) => {
      if (prev && group.some((g) => g.sku === prev)) return prev;
      return group[0].sku;
    });
  }, [decodedName, group?.length]);

  const selectedItem = React.useMemo(() => {
    if (!group?.length) return null;
    if (!selectedSku) return group[0];
    return group.find((g) => g.sku === selectedSku) || group[0];
  }, [group, selectedSku]);

  const displayImage = selectedItem?.image || mainProduct?.image || "";

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <button
        onClick={() => history.back()}
        className="inline-flex items-center gap-1.5 text-xs mb-4 px-3 py-1.5 rounded-full border border-slate-200 text-slate-700 hover:border-slate-900 hover:text-slate-900 bg-white shadow-sm transition-colors"
      >
        <span className="text-sm">←</span>
        <span>返回列表</span>
      </button>

      {!mainProduct ? (
        <p className="text-sm text-slate-500">找不到此商品。</p>
      ) : (
        <div className="grid gap-8 md:grid-cols-[1.1fr,0.9fr]">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="aspect-[4/5] bg-slate-100">
              {displayImage ? (
                <img
                  src={displayImage}
                  alt={mainProduct.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                  No Image
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="text-lg font-semibold tracking-tight">
              {mainProduct.name}
            </h1>

            {selectedItem?.price != null ? (
              <div className="space-y-0.5">
                {formatTWDFromJPY(selectedItem.price, rate) ? (
                  <p className="text-base text-slate-900">
                    {formatTWDFromJPY(selectedItem.price, rate)}
                  </p>
                ) : (
                  <p className="text-base text-slate-500">價格請洽詢</p>
                )}
              </div>
            ) : null}

            {mainProduct.description && (
              <p className="text-sm text-slate-600 whitespace-pre-line">
                {mainProduct.description}
              </p>
            )}

            {(selectedItem?.introduction || mainProduct?.introduction) ? (
              <div className="pt-2">
                <h2 className="text-xs font-medium text-slate-500 tracking-[0.2em] uppercase mb-2">
                  商品介紹
                </h2>
                <div className="text-sm text-slate-700 whitespace-pre-line bg-white rounded-2xl border border-slate-200 p-4">
                  {selectedItem?.introduction || mainProduct?.introduction}
                </div>
              </div>
            ) : null}

            <div className="mt-2 space-y-3">
              {group.length >= 1 ? (
                <div>
                  <h2 className="text-xs font-medium text-slate-500 tracking-[0.2em] uppercase mb-2">
                    規格
                  </h2>
                  <div className="space-y-2">
                    {group.map((item, index) => {
                      const label =
                        item.variant || (group.length === 1 ? "單一規格" : `款式 ${index + 1}`);
                      return (
                        <label
                          key={item.sku || item.id || index}
                          className={[
                            "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 cursor-pointer",
                            selectedSku === item.sku
                              ? "border-slate-900 bg-slate-50"
                              : "border-slate-200 bg-white hover:border-slate-900",
                          ].join(" ")}
                        >
                          <span className="flex items-center gap-2 text-sm text-slate-700 min-w-0">
                            <input
                              type="radio"
                              name="variant"
                              checked={selectedSku === item.sku}
                              onChange={() => setSelectedSku(item.sku)}
                            />
                            {item.image ? (
                              <span className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
                                <img
                                  src={item.image}
                                  alt={label}
                                  className="w-full h-full object-contain"
                                  loading="lazy"
                                />
                              </span>
                            ) : null}
                            <span>{label}</span>
                          </span>
                          <span className="text-xs text-slate-500">
                            {item.price != null ? formatTWDFromJPY(item.price, rate) || "" : ""}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => selectedItem && onAddToCart(selectedItem, 1)}
                disabled={!selectedItem}
                className="w-full rounded-xl bg-slate-900 text-white text-sm py-3 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                加入購物車
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function CartDrawer({
  open,
  onClose,
  items,
  rate,
  onInc,
  onDec,
  onRemove,
  onClear,
}) {
  const [copyState, setCopyState] = React.useState({ status: "idle", message: "" });

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    setCopyState({ status: "idle", message: "" });
  }, [open]);

  const totalJPY = React.useMemo(() => {
    return items.reduce((sum, it) => sum + (toNumberOrNull(it.price) || 0) * it.qty, 0);
  }, [items]);

  const totalTWD = formatTWDFromJPY(totalJPY, rate);

  function buildCheckoutText() {
    const lines = [];
    lines.push("MAARU 日本萌GO代購登記清單：");
    lines.push("");

    const r = toNumberOrNull(rate);

    for (const it of items) {
      const name = (it.name || "").trim();
      const variant = (it.variant || "").trim();
      const qty = Number(it.qty || 0);
      const jpy = toNumberOrNull(it.price) || 0;
      const lineName = variant ? `${name} ${variant}` : name;

      if (r != null) {
        const twd = Math.round(jpy * r * qty);
        lines.push(`${lineName} × ${qty}  NT$${twd.toLocaleString("zh-TW")}`);
      } else {
        lines.push(`${lineName} × ${qty}  NT$—`);
      }
    }

    lines.push("");
    if (r != null) {
      const total = Math.round((toNumberOrNull(totalJPY) || 0) * r);
      lines.push(`商品總計：NT$${total.toLocaleString("zh-TW")}`);
    } else {
      lines.push(`商品總計：NT$—`);
    }
    lines.push("");
    lines.push("已複製完成，請直接回傳到官方LINE登記建立訂單");

    return lines.join("\n");
  }

  async function copyCheckoutText() {
    if (!items.length) return;
    const text = buildCheckoutText();

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "true");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.left = "-1000px";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (!ok) throw new Error("copy_failed");
      }

      setCopyState({
        status: "success",
        message: "已複製完成，請直接回傳到官方LINE登記建立訂單",
      });
    } catch (e) {
      setCopyState({
        status: "error",
        message: "複製失敗，請改用手動選取文字。",
      });
      console.error("Copy failed:", e);
    }
  }

  return (
    <div
      className={[
        "fixed inset-0 z-40",
        open ? "pointer-events-auto" : "pointer-events-none",
      ].join(" ")}
      aria-hidden={!open}
    >
      <div
        className={[
          "absolute inset-0 bg-black/30 transition-opacity",
          open ? "opacity-100" : "opacity-0",
        ].join(" ")}
        onClick={onClose}
      />
      <aside
        className={[
          "absolute right-0 top-0 h-full w-full max-w-md bg-white border-l border-slate-200",
          "transition-transform duration-200",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <div className="h-full flex flex-col">
          <div className="px-4 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold tracking-[0.15em] uppercase">
                Cart
              </p>
              <p className="text-xs text-slate-500">{items.length} 項</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full border border-slate-200 hover:border-slate-900"
              aria-label="關閉購物車"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">購物車目前是空的。</p>
            ) : (
              items.map((it) => (
                <div
                  key={it.key}
                  className="flex gap-3 rounded-2xl border border-slate-200 p-3"
                >
                  <div className="w-16 h-20 bg-slate-100 rounded-xl overflow-hidden flex-shrink-0">
                    {it.image ? (
                      <img
                        src={it.image}
                        alt={it.name}
                        className="w-full h-full object-contain"
                        loading="lazy"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-clamp-2">{it.name}</p>
                    {it.variant ? (
                      <p className="text-xs text-slate-500 mt-0.5">{it.variant}</p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="text-xs text-slate-600">
                        {(() => {
                          const r = toNumberOrNull(rate);
                          const jpyUnit = toNumberOrNull(it.price) || 0;
                          const qty = Number(it.qty || 0);
                          const jpyLine = jpyUnit * qty;
                          const twdText =
                            r != null
                              ? `NT$${Math.round(jpyLine * r).toLocaleString("zh-TW")}`
                              : "";

                          return (
                            <div className="space-y-0.5">
                              {twdText ? (
                                <div>{twdText}</div>
                              ) : (
                                <div className="text-slate-500">價格請洽詢</div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onDec(it.key)}
                          className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-900"
                          aria-label="減少數量"
                        >
                          −
                        </button>
                        <span className="text-sm w-6 text-center">{it.qty}</span>
                        <button
                          type="button"
                          onClick={() => onInc(it.key)}
                          className="w-8 h-8 rounded-full border border-slate-200 hover:border-slate-900"
                          aria-label="增加數量"
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemove(it.key)}
                          className="text-xs text-slate-500 hover:text-slate-900 ml-1"
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="px-4 py-4 border-t border-slate-200 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 tracking-[0.2em] uppercase">
                  Total
                </p>
                <p className="text-base font-semibold">{totalTWD || "—"}</p>
              </div>
              {items.length > 0 ? (
                <button
                  type="button"
                  onClick={onClear}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  清空
                </button>
              ) : null}
            </div>
            <button
              type="button"
              disabled={items.length === 0}
              onClick={copyCheckoutText}
              className="w-full rounded-xl bg-slate-900 text-white text-sm py-3 hover:bg-slate-800 disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              複製登記文字
            </button>
            {copyState.status !== "idle" ? (
              <p
                className={[
                  "text-xs",
                  copyState.status === "success" ? "text-slate-600" : "text-red-600",
                ].join(" ")}
              >
                {copyState.message}
              </p>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  );
}

function NotFoundPage() {
  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <p className="text-sm text-slate-500">頁面不存在，請回到首頁。</p>
      <Link to="/" className="inline-block mt-3 text-xs text-slate-900 underline">
        回首頁
      </Link>
    </main>
  );
}

function App() {
  const { products, rate, loading, error } = useProducts();
  const path = useHashPath();
  const route = React.useMemo(() => getRoute(path), [path]);

  const CART_KEY = "maarushop_cart_v1";
  const [cartOpen, setCartOpen] = React.useState(false);
  const [cartItems, setCartItems] = React.useState(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cartItems));
    } catch {
      // ignore
    }
  }, [cartItems]);

  const cartCount = React.useMemo(() => {
    return cartItems.reduce((sum, it) => sum + (it.qty || 0), 0);
  }, [cartItems]);

  function addToCart(product, qty) {
    const key = product.sku || [product.name, product.variant || "", product.price ?? ""].join("||");
    const addQty = Math.max(1, Number(qty || 1));
    setCartItems((prev) => {
      const idx = prev.findIndex((x) => x.key === key);
      if (idx >= 0) {
        const copy = prev.slice();
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + addQty };
        return copy;
      }
      return [
        ...prev,
        {
          key,
          name: product.name,
          variant: product.variant || "",
          price: product.price,
          image: product.image || "",
          qty: addQty,
        },
      ];
    });
    setCartOpen(true);
  }

  function incItem(key) {
    setCartItems((prev) =>
      prev.map((it) => (it.key === key ? { ...it, qty: it.qty + 1 } : it))
    );
  }

  function decItem(key) {
    setCartItems((prev) =>
      prev
        .map((it) => (it.key === key ? { ...it, qty: it.qty - 1 } : it))
        .filter((it) => it.qty > 0)
    );
  }

  function removeItem(key) {
    setCartItems((prev) => prev.filter((it) => it.key !== key));
  }

  function clearCart() {
    setCartItems([]);
  }

  let page = null;
  if (route.name === "home") {
    page = (
      <HomePage
        products={products}
        rate={rate}
        loading={loading}
        error={error}
      />
    );
  } else if (route.name === "product") {
    page = (
      <ProductDetailPage
        products={products}
        rate={rate}
        encodedName={route.encodedName}
        onAddToCart={addToCart}
      />
    );
  } else {
    page = <NotFoundPage />;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar cartCount={cartCount} onOpenCart={() => setCartOpen(true)} />
      {page}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cartItems}
        rate={rate}
        onInc={incItem}
        onDec={decItem}
        onRemove={removeItem}
        onClear={clearCart}
      />
    </div>
  );
}

const rootEl = document.getElementById("root");
const root = ReactDOM.createRoot(rootEl);
root.render(<App />);

