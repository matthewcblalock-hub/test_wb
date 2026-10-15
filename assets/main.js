/* Creech Heating and Air · site behavior (no dependencies) */
(() => {
  "use strict";

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const track = (event, props) => { if (typeof window.plausible === "function") window.plausible(event, props && { props }); };

  /* ---------- Year ---------- */
  $$("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  /* ---------- Header state ---------- */
  const header = $("[data-header]");
  const onScroll = () => header?.classList.toggle("is-scrolled", window.scrollY > 10);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- Mobile navigation ---------- */
  const nav = $("[data-nav]");
  const toggle = $("[data-nav-toggle]");
  const mobileBar = $("[data-mobile-bar]");

  const setNav = (open) => {
    if (!nav || !toggle) return;
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    $("[data-nav-label]", toggle).textContent = open ? "Close menu" : "Open menu";
    document.body.style.overflow = open ? "hidden" : "";
    mobileBar?.classList.toggle("is-hidden", open);
    if (open) $("a", nav)?.focus();
  };
  toggle?.addEventListener("click", () => setNav(toggle.getAttribute("aria-expanded") !== "true"));
  $$("a", nav ?? document.createElement("div")).forEach((a) => a.addEventListener("click", () => setNav(false)));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle?.getAttribute("aria-expanded") === "true") { setNav(false); toggle.focus(); }
  });
  window.matchMedia("(min-width: 1061px)").addEventListener("change", (e) => e.matches && setNav(false));

  /* ---------- Mobile action bar: step aside while the form is on screen ---------- */
  const formCard = $("[data-form-card]");
  if (mobileBar && formCard && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => mobileBar.classList.toggle("is-hidden", entry.isIntersecting), {
      rootMargin: "0px 0px -80px 0px",
    }).observe(formCard);
  }

  /* ---------- Reviews carousel (native scroll-snap + buttons) ---------- */
  $$("[data-carousel]").forEach((trackEl) => {
    const section = trackEl.closest("section");
    const prev = $("[data-carousel-prev]", section);
    const next = $("[data-carousel-next]", section);
    if (!prev || !next) return;
    const update = () => {
      const max = trackEl.scrollWidth - trackEl.clientWidth - 2;
      prev.disabled = trackEl.scrollLeft <= 2;
      next.disabled = trackEl.scrollLeft >= max;
    };
    const go = (dir) => trackEl.scrollBy({ left: dir * trackEl.clientWidth, behavior: reduceMotion ? "auto" : "smooth" });
    prev.addEventListener("click", () => go(-1));
    next.addEventListener("click", () => go(1));
    trackEl.addEventListener("scroll", update, { passive: true });
    trackEl.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
    });
    window.addEventListener("resize", update);
    update();
  });

  /* ---------- Restrained reveal on scroll ---------- */
  if (!reduceMotion && "IntersectionObserver" in window) {
    const targets = $$(".section-head, .service-card, .value, .review-card, .principle, .step, .faq__item, .area__panel, .about__media, .difference__media, .form-card, .trust__item");
    document.documentElement.classList.add("js-reveal");
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    targets.forEach((el) => {
      const siblings = [...el.parentElement.children].filter((c) => c.matches(el.tagName));
      el.style.setProperty("--delay", `${Math.min(siblings.indexOf(el), 4) * 70}ms`);
      el.setAttribute("data-reveal", "");
      io.observe(el);
    });
  }

  /* ---------- Conversion tracking (only if analytics is configured) ---------- */
  document.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="tel:"]');
    if (link) track("Call Click", { location: link.closest("section, header, footer, [data-mobile-bar]")?.className.split(" ")[0] ?? "page" });
  });

  /* ---------- Service request form ---------- */
  $$("[data-request-form]").forEach((form) => {
    const card = form.closest("[data-form-card]");
    const errorBox = $("[data-form-error]", form);
    const success = $("[data-success-text]", card)?.closest("[data-form-success]");
    const submitBtn = $("[data-submit]", form);
    const submitLabel = $("[data-submit-label]", form);
    const endpoint = form.dataset.endpoint;
    const phone = form.dataset.phone;
    let hidden = {};
    try { hidden = JSON.parse(form.dataset.hidden || "{}"); } catch { /* ignore malformed config */ }
    let attempted = false;

    const callText = phone ? ` or call <a href="tel:${phone.replace(/[^\d+]/g, "")}">${phone}</a>` : "";

    const rules = {
      name: (v) => (v.trim().length >= 2 ? "" : "Please enter your name."),
      phone: (v) => (v.replace(/\D/g, "").length >= 10 ? "" : "Please enter a phone number we can reach you at, including area code."),
      email: (v, data) => {
        if (!v.trim()) return data.contactMethod === "Email" ? "Please enter your email address, since you'd like us to contact you by email." : "";
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) ? "" : "Please enter a valid email address, like name@example.com.";
      },
      location: (v) => (v.trim().length >= 3 ? "" : "Please enter your service address or ZIP code."),
      service: (v) => (v ? "" : "Please choose what you need help with."),
      message: (v) => (v.trim().length >= 5 ? "" : "Please briefly describe the problem so we can help."),
    };

    const showFieldError = (name, message) => {
      const input = form.elements[name];
      if (!input || input instanceof RadioNodeList) return;
      const err = $(`#${input.id}-error`, form);
      input.setAttribute("aria-invalid", message ? "true" : "false");
      if (err) { err.textContent = message; err.hidden = !message; }
    };

    const validate = () => {
      const data = Object.fromEntries(new FormData(form));
      const errors = Object.entries(rules)
        .map(([name, rule]) => [name, rule(data[name] ?? "", data)])
        .filter(([name, msg]) => (showFieldError(name, msg), msg));
      return { data, errors };
    };

    const showAlert = (html) => {
      errorBox.innerHTML = `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg><p>${html}</p>`;
      errorBox.hidden = false;
      errorBox.setAttribute("role", "alert");
      errorBox.focus();
    };
    const clearAlert = () => { errorBox.hidden = true; errorBox.innerHTML = ""; };

    const setBusy = (busy) => {
      submitBtn.disabled = busy;
      submitBtn.setAttribute("aria-busy", String(busy));
      submitLabel.textContent = busy ? "Sending…" : "Request Service";
    };

    // Re-check a field as the visitor fixes it, after the first submit attempt.
    form.addEventListener("input", (e) => {
      if (!attempted) return;
      const name = e.target.name;
      if (rules[name]) showFieldError(name, rules[name](e.target.value, Object.fromEntries(new FormData(form))));
      if (name === "contactMethod") showFieldError("email", rules.email(form.elements.email.value, Object.fromEntries(new FormData(form))));
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      attempted = true;
      clearAlert();

      const { data, errors } = validate();
      if (errors.length) {
        const n = errors.length;
        showAlert(`Please fix ${n === 1 ? "the highlighted field" : `the ${n} highlighted fields`} below.`);
        form.elements[errors[0][0]].focus();
        return;
      }
      if (data.website) return; // spam trap filled: drop silently

      if (!endpoint) {
        // Never fake a success: the form isn't connected to anything yet.
        showAlert(`Sorry, online requests aren't available right now.${phone ? ` Please call <a href="tel:${phone.replace(/[^\d+]/g, "")}">${phone}</a> instead.` : ""}`);
        return;
      }

      setBusy(true);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        delete data.website;
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            ...hidden,
            ...data,
            _subject: `Service request: ${data.service} (${data.name})`,
            page: window.location.href,
          }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const first = data.name.trim().split(/\s+/)[0];
        $("[data-success-text]", card).textContent =
          `Thanks, ${first}. We've received your request and will follow up by ${data.contactMethod.toLowerCase()} using the details you provided.`;
        form.hidden = true;
        success.hidden = false;
        success.focus();
        track("Service Request", { service: data.service });
      } catch (err) {
        showAlert(`Sorry, we couldn't send your request${err.name === "AbortError" ? " (the connection timed out)" : ""}. Please try again${callText}.`);
      } finally {
        clearTimeout(timeout);
        setBusy(false);
      }
    });
  });
})();
