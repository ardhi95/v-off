(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const root = document.documentElement;

  /* ---------- theme ---------- */
  const storedTheme = (() => { try { return localStorage.getItem("theme"); } catch { return null; } })();
  if (storedTheme) root.dataset.theme = storedTheme;
  else if (window.matchMedia("(prefers-color-scheme: light)").matches) root.dataset.theme = "light";
  $(".theme-toggle").addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch {}
  });

  /* ---------- loader + split title ---------- */
  $$(".split").forEach((el) => {
    const text = el.textContent;
    el.textContent = "";
    [...text].forEach((ch, i) => {
      const span = document.createElement("span");
      span.className = "char";
      span.textContent = ch;
      span.style.transitionDelay = `${0.3 + i * 0.07}s`;
      el.appendChild(span);
    });
  });
  window.addEventListener("load", () => setTimeout(() => document.body.classList.add("loaded"), reduceMotion ? 0 : 500));

  $("#year").textContent = new Date().getFullYear();

  /* ---------- typing effect ---------- */
  const typed = $(".typed");
  const words = JSON.parse(typed.dataset.words);
  let wi = 0, ci = 0, deleting = false;
  const type = () => {
    const word = words[wi];
    typed.textContent = word.slice(0, ci);
    if (!deleting && ci === word.length) { deleting = true; return setTimeout(type, 1600); }
    if (deleting && ci === 0) { deleting = false; wi = (wi + 1) % words.length; return setTimeout(type, 300); }
    ci += deleting ? -1 : 1;
    setTimeout(type, deleting ? 40 : 85);
  };
  if (reduceMotion) typed.textContent = words[0]; else setTimeout(type, 1200);

  /* ---------- particles background ---------- */
  const canvas = $("#bg");
  const ctx = canvas.getContext("2d");
  const mouse = { x: -9999, y: -9999 };
  let particles = [], w, h, dpr;
  const colors = ["124,92,255", "0,212,255", "255,78,205"];

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = innerWidth * dpr;
    h = canvas.height = innerHeight * dpr;
    const count = Math.min(110, Math.floor((innerWidth * innerHeight) / 14000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4 * dpr, vy: (Math.random() - 0.5) * 0.4 * dpr,
      r: (Math.random() * 1.8 + 0.6) * dpr, c: colors[(Math.random() * colors.length) | 0],
    }));
  };
  const draw = () => {
    ctx.clearRect(0, 0, w, h);
    const linkDist = 130 * dpr, mouseDist = 180 * dpr;
    const light = root.dataset.theme === "light";
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy);
      if (d < mouseDist) { const f = (1 - d / mouseDist) * 0.6; p.x += (dx / d) * f * 3; p.y += (dy / d) * f * 3; }
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.c},${light ? 0.55 : 0.8})`;
      ctx.fill();
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j], dist = Math.hypot(p.x - q.x, p.y - q.y);
        if (dist < linkDist) {
          ctx.strokeStyle = `rgba(${p.c},${(1 - dist / linkDist) * (light ? 0.18 : 0.25)})`;
          ctx.lineWidth = dpr * 0.8;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        }
      }
    }
    if (!reduceMotion) requestAnimationFrame(draw);
  };
  resize(); draw();
  addEventListener("resize", resize);
  addEventListener("mouseleave", () => { mouse.x = mouse.y = -9999; });

  /* ---------- custom cursor ---------- */
  const cursor = $(".cursor"), dot = $(".cursor-dot");
  let cx = 0, cy = 0, tx = 0, ty = 0;
  addEventListener("mousemove", (e) => {
    if (!document.body.classList.contains("cursor-on")) { cx = e.clientX; cy = e.clientY; document.body.classList.add("cursor-on"); }
    tx = e.clientX; ty = e.clientY;
    mouse.x = e.clientX * dpr; mouse.y = e.clientY * dpr;
    dot.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, -50%)`;
  });
  if (finePointer) {
    const follow = () => {
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
      cursor.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%)`;
      requestAnimationFrame(follow);
    };
    follow();
    $$("a, button, .tag-cloud span, input, textarea").forEach((el) => {
      el.addEventListener("mouseenter", () => cursor.classList.add("hover"));
      el.addEventListener("mouseleave", () => cursor.classList.remove("hover"));
    });
  }

  /* ---------- magnetic buttons ---------- */
  if (finePointer && !reduceMotion) {
    $$(".magnetic").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
        el.style.transform = `translate(${x * 0.3}px, ${y * 0.4}px)`;
        const inner = el.firstElementChild;
        if (inner) inner.style.transform = `translate(${x * 0.15}px, ${y * 0.2}px)`;
      });
      el.addEventListener("mouseleave", () => {
        el.style.transform = "";
        if (el.firstElementChild) el.firstElementChild.style.transform = "";
      });
    });
  }

  /* ---------- 3D tilt + glow ---------- */
  if (finePointer && !reduceMotion) {
    $$(".tilt").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        el.style.transform = `perspective(900px) rotateX(${(0.5 - py) * 14}deg) rotateY(${(px - 0.5) * 14}deg) scale(1.02)`;
        el.style.setProperty("--mx", `${px * 100}%`);
        el.style.setProperty("--my", `${py * 100}%`);
      });
      el.addEventListener("mouseleave", () => { el.style.transform = ""; });
    });
  }

  /* ---------- tag float stagger ---------- */
  $$(".tag-cloud span").forEach((el, i) => el.style.setProperty("--i", i));

  /* ---------- reveal + counters + bars ---------- */
  const countUp = (el) => {
    const to = +el.dataset.to, dur = 1800, start = performance.now();
    const step = (t) => {
      const k = Math.min((t - start) / dur, 1), eased = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(to * eased).toLocaleString("id-ID");
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const fillBar = (bar) => {
    const lvl = +bar.dataset.level, pct = $(".pct", bar);
    $(".bar-fill", bar).style.width = `${lvl}%`;
    const start = performance.now();
    const step = (t) => {
      const k = Math.min((t - start) / 1600, 1);
      pct.textContent = `${Math.round(lvl * (1 - Math.pow(1 - k, 3)))}%`;
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const siblings = $$(":scope > .reveal", el.parentElement);
      el.style.transitionDelay = `${Math.max(0, siblings.indexOf(el)) * 0.08}s`;
      el.classList.add("in");
      el.addEventListener("transitionend", () => { el.style.transitionDelay = ""; }, { once: true });
      $$(".count", el).forEach(countUp);
      if (el.classList.contains("bar")) fillBar(el);
      io.unobserve(el);
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  /* ---------- scroll: progress, nav, active link, timeline ---------- */
  const progress = $(".progress"), nav = $(".nav"), timeline = $(".timeline");
  const links = $$(".nav-links a");
  const sections = links.map((a) => $(a.getAttribute("href")));
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    nav.classList.toggle("scrolled", y > 40);
    nav.classList.toggle("hide", y > lastY && y > 400 && !document.body.classList.contains("menu-open"));
    lastY = y;

    let current = -1;
    sections.forEach((s, i) => { if (s.getBoundingClientRect().top < innerHeight * 0.4) current = i; });
    links.forEach((a, i) => a.classList.toggle("active", i === current));

    const r = timeline.getBoundingClientRect();
    const k = Math.min(Math.max((innerHeight * 0.6 - r.top) / r.height, 0), 1);
    timeline.style.setProperty("--line", `${k * 100}%`);
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- mobile menu ---------- */
  const menuBtn = $(".menu-toggle");
  const setMenu = (open) => {
    document.body.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", open);
  };
  menuBtn.addEventListener("click", () => setMenu(!document.body.classList.contains("menu-open")));
  links.forEach((a) => a.addEventListener("click", () => setMenu(false)));

  /* ---------- project filter ---------- */
  const cards = $$(".card");
  $$(".filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      $$(".filter").forEach((b) => b.classList.toggle("active", b === btn));
      const f = btn.dataset.filter;
      cards.forEach((card) => {
        const show = f === "all" || card.dataset.cat === f;
        if (show) {
          card.hidden = false;
          card.classList.add("fading", "in");
          requestAnimationFrame(() => requestAnimationFrame(() => card.classList.remove("fading")));
        } else {
          card.classList.add("fading");
          setTimeout(() => { if (card.classList.contains("fading")) card.hidden = true; }, 350);
        }
      });
    });
  });

  /* ---------- confetti ---------- */
  const burst = (x, y) => {
    if (reduceMotion) return;
    const palette = ["#7c5cff", "#00d4ff", "#ff4ecd", "#ffd166"];
    for (let i = 0; i < 40; i++) {
      const c = document.createElement("span");
      c.className = "confetti";
      c.style.background = palette[i % palette.length];
      document.body.appendChild(c);
      const angle = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
      c.animate([
        { transform: `translate(${x}px, ${y}px) rotate(0)`, opacity: 1 },
        { transform: `translate(${x + Math.cos(angle) * v}px, ${y + Math.sin(angle) * v + 200}px) rotate(${Math.random() * 720}deg)`, opacity: 0 },
      ], { duration: 1200 + Math.random() * 600, easing: "cubic-bezier(.22,1,.36,1)" }).onfinish = () => c.remove();
    }
  };

  /* ---------- contact form ---------- */
  const form = $(".contact-form"), note = $(".form-note");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let ok = true;
    $$("input, textarea", form).forEach((f) => {
      const field = f.parentElement;
      field.classList.remove("error");
      if (!f.checkValidity() || !f.value.trim()) {
        void field.offsetWidth;
        field.classList.add("error");
        ok = false;
      }
    });
    if (!ok) { note.textContent = "Mohon lengkapi semua kolom dengan benar."; return; }
    const { name, email, message } = Object.fromEntries(new FormData(form));
    const btn = $("button[type=submit]", form).getBoundingClientRect();
    burst(btn.left + btn.width / 2, btn.top + btn.height / 2);
    note.textContent = `Terima kasih, ${name}! Membuka aplikasi email Anda…`;
    const body = encodeURIComponent(`${message}\n\n— ${name} (${email})`);
    setTimeout(() => { location.href = `mailto:hello@example.com?subject=${encodeURIComponent("Halo dari " + name)}&body=${body}`; }, 700);
    form.reset();
  });

  /* ---------- easter egg: click the name ---------- */
  $(".hero-title").addEventListener("click", (e) => burst(e.clientX, e.clientY));

  /* ---------- back to top ---------- */
  $(".to-top").addEventListener("click", () => scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }));
})();
