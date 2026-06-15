/* ariaOS Training Academy — standalone sandbox prototype
   Modular round-plugin engine. Add a round = push one module to ROUNDS. No engine edits. */
(function(){
  "use strict";

  /* ============================================================
     ENGINE
     ============================================================ */
  const $ = id => document.getElementById(id);
  const view = $("view");
  const bubble = $("bubble");
  const ariaFig = $("ariaFig");

  // in-memory best stars per round id (no storage)
  const bestStars = {};

  /* ---- helper: element builder ---- */
  function el(tag, attrs, kids){
    const n = document.createElement(tag);
    if(attrs) for(const k in attrs){
      if(k==="class") n.className = attrs[k];
      else if(k==="html") n.innerHTML = attrs[k];
      else if(k.startsWith("on") && typeof attrs[k]==="function") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    (kids||[]).forEach(c=>{ if(c==null) return; n.appendChild(typeof c==="string"?document.createTextNode(c):c); });
    return n;
  }
  const money = v => "$"+Number(v).toFixed(2);

  /* ---- Aria poses (with PNG fallback to coloured circle) ---- */
  ariaFig.querySelectorAll("img").forEach(img=>{
    img.addEventListener("error", ()=>{
      const pose = img.getAttribute("data-pose");
      const on = img.classList.contains("on");
      const d = el("div",{class:"aria-fallback","data-pose":pose});
      d.style.position="absolute"; d.style.inset="0"; d.style.margin="auto";
      d.style.opacity = on ? "1":"0"; d.style.transition="opacity .25s ease";
      d.textContent="A";
      ariaFig.appendChild(d);
      img.remove();
    });
  });
  function setPose(pose){
    ariaFig.querySelectorAll("[data-pose]").forEach(node=>{
      const match = node.getAttribute("data-pose")===pose;
      if(node.tagName==="IMG") node.classList.toggle("on", match);
      else node.style.opacity = match ? "1":"0";
    });
  }
  function say(text, pose){
    if(pose) setPose(pose);
    bubble.textContent = text;
    bubble.classList.remove("pulse"); void bubble.offsetWidth; bubble.classList.add("pulse");
  }

  /* ---- Audio (generated, no files) ---- */
  let actx=null;
  function ac(){ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return actx; }
  function tone(freq,dur,type,gain,delay){
    const c=ac(); if(!c) return;
    const t0=c.currentTime+(delay||0), o=c.createOscillator(), g=c.createGain();
    o.type=type||"sine"; o.frequency.value=freq;
    g.gain.setValueAtTime(0,t0);
    g.gain.linearRampToValueAtTime(gain||0.16,t0+0.012);
    g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0+dur+0.02);
  }
  const sfx={
    tap(){ tone(520,0.08,"triangle",0.09); },
    chaching(){ tone(1318,0.12,"square",0.10,0); tone(1760,0.18,"square",0.10,0.07); tone(2093,0.22,"sine",0.08,0.14); },
    good(){ tone(660,0.12,"sine",0.15,0); tone(880,0.16,"sine",0.15,0.10); tone(1175,0.2,"sine",0.13,0.20); },
    bad(){ tone(220,0.18,"sawtooth",0.09,0); tone(180,0.22,"sawtooth",0.09,0.08); },
    win(){ [523,659,784,1047,1319].forEach((f,i)=>tone(f,0.3,"triangle",0.13,i*0.10)); },
  };

  /* ---- Confetti + toast ---- */
  function confetti(){
    const fx=$("fx"), cols=["#7FB897","#2D5240","#C9A37A","#BA7517","#E24B4A","#ffffff"];
    for(let i=0;i<70;i++){
      const c=el("div",{class:"confetti"});
      c.style.left=Math.random()*100+"vw";
      c.style.background=cols[Math.floor(Math.random()*cols.length)];
      const dur=1.6+Math.random()*1.4;
      c.style.animation=`fall ${dur}s ${Math.random()*0.3}s ease-in forwards`;
      c.style.top="-20px"; c.style.transform=`rotate(${Math.random()*360}deg)`;
      fx.appendChild(c); setTimeout(()=>c.remove(),(dur+0.4)*1000);
    }
  }
  let toastT=null;
  function toast(msg,bad){
    const t=$("toast"); t.textContent=msg; t.classList.toggle("bad",!!bad); t.classList.add("show");
    clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),1100);
  }

  const starsFor = s => s>=85 ? 3 : s>=60 ? 2 : 1;
  const starStr = n => "★".repeat(n)+"☆".repeat(3-n);

  /* ---- shared API handed to each round ---- */
  const api = { el, money, say, setPose, sfx, confetti, toast };

  /* ============================================================
     REUSABLE QUIZ FLOW (used by data-reasoning rounds)
     questions: [{ panel:Node, prompt:String, options:[{label,correct,explain}] }]
     ============================================================ */
  function runQuiz(container, questions, onComplete){
    let idx=0, correct=0;
    function show(){
      const q=questions[idx];
      container.innerHTML="";
      container.appendChild(el("div",{class:"qmeta"},[`Question ${idx+1} of ${questions.length}`]));
      if(q.panel) container.appendChild(q.panel);
      container.appendChild(el("div",{class:"prompt"},[q.prompt]));
      const choices=el("div",{class:"choices"});
      const order=q.options.map((o,i)=>i);
      // present in given order (already authored shuffled-enough)
      const btns=[];
      order.forEach((oi,n)=>{
        const o=q.options[oi];
        const b=el("button",{class:"choice"},[
          el("span",{class:"mk"},[String.fromCharCode(65+n)]),
          el("span",{},[o.label])
        ]);
        b.addEventListener("click",()=>answer(o,b,btns,q,choices,container));
        btns.push(b); choices.appendChild(b);
      });
      container.appendChild(choices);
    }
    function answer(opt,btn,btns,q,choices,container){
      btns.forEach(b=>b.classList.add("locked"));
      if(opt.correct){
        btn.classList.add("right"); correct++; sfx.good(); say("Exactly right ☕","cheer");
      } else {
        btn.classList.add("wrong"); sfx.bad(); say("Not quite — look closer at the data.","eyes");
        // reveal the correct one
        const ci=q.options.findIndex(o=>o.correct);
        if(ci>=0 && btns[ci]) btns[ci].classList.add("right");
      }
      const ex=opt.correct ? (opt.explain||"Grounded in the numbers shown.") :
        ( "Why not: "+(opt.explain||"that isn't supported by the data.") );
      container.appendChild(el("div",{class:"explain",html:"<b>"+(opt.correct?"Correct.":"Heads up.")+"</b> "+ex}));
      const next=el("div",{class:"btn-row"},[
        el("button",{class:"btn btn-primary"},[ idx<questions.length-1 ? "Next question →" : "See result" ])
      ]);
      next.querySelector("button").addEventListener("click",()=>{
        idx++;
        if(idx>=questions.length) onComplete(Math.round(correct/questions.length*100));
        else show();
      });
      container.appendChild(next);
    }
    show();
  }
  api.runQuiz = runQuiz;

  /* ---- small data-panel builder ---- */
  function dataPanel(heading, stats){
    return el("div",{class:"panel"},[
      el("div",{class:"ph"},[heading]),
      el("div",{class:"grid2"}, stats.map(s=>el("div",{class:"stat"},[
        el("div",{class:"n"},[s.n]), el("div",{class:"l"},[s.l])
      ])))
    ]);
  }
  api.dataPanel = dataPanel;

  /* ============================================================
     ROUND MODULES
     ============================================================ */
  const ROUNDS = [];

  /* ---------- 1. POS — Run the register ---------- */
  ROUNDS.push({
    id:"pos", name:"Run the register", icon:"🧾",
    blurb:"Build the order, take payment, give the right change.",
    teaches:"Point of sale",
    ariaIntro:["Tap the items they ordered, charge, then give change. Quick!","point"],
    render(c, done){
      const PRODUCTS=[
        {id:"fw",name:"Flat White",price:4.50,emoji:"☕"},{id:"lt",name:"Latte",price:4.80,emoji:"🥛"},
        {id:"cp",name:"Cappuccino",price:4.50,emoji:"☕"},{id:"cr",name:"Croissant",price:5.00,emoji:"🥐"},
        {id:"mf",name:"Muffin",price:4.20,emoji:"🧁"},{id:"ck",name:"Cookie",price:3.50,emoji:"🍪"},
        {id:"oj",name:"Orange Juice",price:5.50,emoji:"🧃"},{id:"sw",name:"Sandwich",price:9.00,emoji:"🥪"},
      ];
      const rand=n=>Math.floor(Math.random()*n);
      // build a 1-3 distinct-item order
      const pool=PRODUCTS.slice(); const order=[];
      const n=1+rand(3);
      for(let i=0;i<n && pool.length;i++){ const p=pool.splice(rand(pool.length),1)[0]; order.push({...p, qty:1+(Math.random()<0.4?1:0)}); }
      const orderText=order.map(i=>`${i.qty}× ${i.name}`).join(", ");
      const total=order.reduce((s,i)=>s+i.price*i.qty,0);
      const ticket={};
      let mistakes=0, stage="order", timeLeft=35, timer=null, finished=false;

      const custFace=["🙂","😀","😊","😎","🥰","🧑","👩","🧔"][rand(8)];
      const bar=el("div",{class:"timerbar"});
      const orderCard=el("div",{class:"order-card"},[
        el("div",{},[el("div",{class:"label"},["Customer order"]), el("div",{class:"want"},[orderText])]),
        el("div",{class:"cust"},[custFace]), bar
      ]);

      const itemsEl=el("div",{class:"items"});
      const totalEl=el("span",{class:"amt"},["$0.00"]);
      const countEl=el("span",{class:"pill"},["0 items"]);
      const chargeBtn=el("button",{class:"btn btn-primary"},["Charge"]); chargeBtn.disabled=true;

      const grid=el("div",{class:"pgrid"});
      PRODUCTS.forEach(p=>{
        const t=el("div",{class:"tile"},[
          el("div",{class:"emoji"},[p.emoji]), el("div",{class:"nm"},[p.name]), el("div",{class:"pr"},[money(p.price)])
        ]);
        t.addEventListener("click",()=>tapTile(p,t));
        grid.appendChild(t);
      });

      const ticketBox=el("div",{class:"ticket"},[
        el("h3",{},["Ticket ", countEl]), itemsEl,
        el("div",{class:"ttotal"},[el("span",{class:"lbl"},["Total"]), totalEl]),
        chargeBtn
      ]);
      const panes=el("div",{class:"panes"},[grid, ticketBox]);
      c.appendChild(orderCard); c.appendChild(panes);

      function matches(){
        const want={}; order.forEach(i=>want[i.id]=i.qty);
        const have=Object.keys(ticket).filter(id=>ticket[id]>0);
        const wk=Object.keys(want);
        return have.length===wk.length && wk.every(id=>ticket[id]===want[id]);
      }
      function renderTicket(){
        const ids=Object.keys(ticket).filter(id=>ticket[id]>0);
        itemsEl.innerHTML="";
        if(!ids.length){ itemsEl.appendChild(el("div",{class:"tempty"},["Tap items the customer ordered…"])); }
        else ids.forEach(id=>{
          const p=PRODUCTS.find(x=>x.id===id), q=ticket[id];
          const row=el("div",{class:"trow"},[
            el("div",{class:"ql"},[el("span",{class:"q"},[q+"×"]), el("span",{},[p.emoji+" "+p.name])]),
            el("span",{class:"lt"},[money(p.price*q)]),
            el("span",{class:"x",title:"remove"},["✕"])
          ]);
          row.querySelector(".x").addEventListener("click",e=>{ e.stopPropagation(); ticket[id]--; if(ticket[id]<=0) delete ticket[id]; renderTicket(); });
          itemsEl.appendChild(row);
        });
        const tot=ids.reduce((s,id)=>s+PRODUCTS.find(x=>x.id===id).price*ticket[id],0);
        const cnt=ids.reduce((s,id)=>s+ticket[id],0);
        totalEl.textContent=money(tot); countEl.textContent=cnt+" item"+(cnt===1?"":"s");
        chargeBtn.disabled=!matches();
      }
      function tapTile(p,t){
        if(stage!=="order"||finished) return;
        sfx.tap(); t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash");
        const want=order.find(i=>i.id===p.id), cur=ticket[p.id]||0;
        if(!want){ mistakes++; say("They didn't order that — tap ✕ to remove.","eyes"); sfx.bad(); }
        else if(cur>=want.qty){ mistakes++; say(`Only ${want.qty}× ${p.name} on this order.`,"eyes"); sfx.bad(); }
        ticket[p.id]=cur+1; renderTicket();
        if(matches()) say("That's the order — hit Charge!","point");
      }
      renderTicket();

      // timer
      bar.style.width="100%";
      timer=setInterval(()=>{
        timeLeft-=0.1; const pct=Math.max(0,timeLeft/35)*100; bar.style.width=pct+"%";
        bar.classList.toggle("warn",pct<55&&pct>=28); bar.classList.toggle("danger",pct<28);
        if(timeLeft<=0){ clearInterval(timer); if(!finished) finish(0); }
      },100);

      chargeBtn.addEventListener("click",()=>{
        if(!matches()||stage!=="order") return;
        stage="pay"; clearInterval(timer); bar.classList.add("hidden");
        sfx.chaching(); say("Order's in — now the change.","cheer");
        // payment
        const NOTES=[5,10,20,50].filter(x=>x>=Math.ceil(total));
        const note=NOTES.length?NOTES[Math.random()<0.5?0:Math.min(NOTES.length-1,1)]:50;
        const change=+(note-total).toFixed(2);
        panes.remove(); orderCard.querySelector(".want").textContent="Paid with "+money(note);
        const pay=el("div",{class:"pay"});
        pay.appendChild(dataPanel("At tender",[
          {n:money(total),l:"Amount due"},{n:money(note),l:"Customer paid"}
        ]));
        pay.appendChild(el("div",{class:"prompt"},["How much change do they get?"]));
        // options
        const opts=new Set([change]);
        [0.5,1,-0.5,2,-1,5].forEach(d=>{ const v=+(change+d).toFixed(2); if(v>=0) opts.add(v); });
        const arr=Array.from(opts).slice(0,4); if(!arr.includes(change)) arr[0]=change;
        for(let i=arr.length-1;i>0;i--){ const j=rand(i+1); [arr[i],arr[j]]=[arr[j],arr[i]]; }
        const cg=el("div",{class:"change-grid"});
        arr.forEach(v=>{
          const b=el("button",{class:"change-opt"},[money(v)]);
          b.addEventListener("click",()=>{
            if(stage!=="pay") return;
            if(Math.abs(v-change)<0.001){ stage="done"; b.classList.add("right"); sfx.good(); confetti(); say("Perfect change! 🎉","cheer"); finish(1); }
            else { mistakes++; b.classList.add("wrong"); sfx.bad(); say(v>change?"Too much — count it again.":"Too little — try again.","eyes"); setTimeout(()=>b.classList.remove("wrong"),600); }
          });
          cg.appendChild(b);
        });
        pay.appendChild(cg); c.appendChild(pay);
      });

      function finish(changeOk){
        if(finished) return; finished=true; clearInterval(timer);
        let score = 50 /*order built*/ + (changeOk?40:0) + Math.round(Math.max(0,timeLeft)*0.3);
        score -= mistakes*8; score=Math.max(0,Math.min(100,score));
        setTimeout(()=>done(score), changeOk?700:300);
      }
    },
    ariaWin:["Smooth service — the register's in safe hands.","cheer"],
    ariaFail:["Watch the order card and count change carefully — run it again.","eyes"],
  });

  /* ---------- 2. LOYALTY — Reward the regular ---------- */
  ROUNDS.push({
    id:"loyalty", name:"Reward the regular", icon:"🎁",
    blurb:"Apply points & gift cards correctly at tender.",
    teaches:"Loyalty + gift cards",
    ariaIntro:["Regulars earn rewards. Apply the right value at tender.","point"],
    render(c, done){
      const Q=[
        { panel:dataPanel("Maya · regular",[
            {n:money(14.30),l:"Bill total"},{n:"240 pts",l:"Loyalty points"},{n:money(8.00),l:"Gift card"}
          ]),
          prompt:"Reward rule: 100 pts = a $5 reward (one per visit). Gift card can cover the rest. What does Maya pay?",
          options:[
            {label:"$1.30 — apply the $5 reward, then $8.00 gift card",correct:true,explain:"$14.30 − $5 reward − $8.00 gift card = $1.30. Max legit value applied."},
            {label:"$9.30 — apply only the $5 reward",explain:"Leaves $8 of gift-card value unused. ariaOS applies everything she's owed."},
            {label:"$6.30 — apply only the gift card",explain:"Skips the $5 reward she earned."},
            {label:"$14.30 — apply nothing",explain:"She has a reward and a gift card sitting right there."},
          ]},
        { panel:dataPanel("Sam · new member",[
            {n:money(9.00),l:"Bill total"},{n:"60 pts",l:"Loyalty points"},{n:money(0.00),l:"Gift card"}
          ]),
          prompt:"Reward rule: 100 pts = $5 reward. Sam has 60 pts. What's the right move?",
          options:[
            {label:"Charge the full $9.00 — not enough points yet",correct:true,explain:"60 pts < 100, so no reward is unlocked. ariaOS won't redeem value that doesn't exist."},
            {label:"Give a $5 reward anyway",explain:"He hasn't reached 100 pts. Inventing a reward loses you money."},
            {label:"Give a $3 reward (60% of $5)",explain:"Rewards aren't pro-rated — it's a 100-pt threshold."},
            {label:"Refuse the sale",explain:"Nothing's wrong — just take payment normally."},
          ]},
        { panel:dataPanel("Jess · gift card only",[
            {n:money(12.50),l:"Bill total"},{n:"0 pts",l:"Loyalty points"},{n:money(20.00),l:"Gift card"}
          ]),
          prompt:"Jess pays entirely on her gift card. What's the new gift-card balance after?",
          options:[
            {label:"$7.50 remaining",correct:true,explain:"$20.00 − $12.50 = $7.50 stays on the card for next time."},
            {label:"$0.00 — the card is used up",explain:"Only $12.50 was spent; the rest carries over."},
            {label:"$12.50 remaining",explain:"That's the amount spent, not what's left."},
            {label:"$32.50 remaining",explain:"You'd be adding the bill instead of subtracting it."},
          ]},
      ];
      runQuiz(c, Q, done);
    },
    ariaWin:["You squeeze every bit of value out for the customer — they'll come back.","cheer"],
    ariaFail:["Apply rewards + gift cards fully, but only when they're actually earned.","eyes"],
  });

  /* ---------- 3. RESTOCK — Beat the shortage ---------- */
  ROUNDS.push({
    id:"restock", name:"Beat the shortage", icon:"📦",
    blurb:"Reorder what's about to run out — leave the rest.",
    teaches:"Inventory + reorder",
    ariaIntro:["Reorder anything with 3 days' cover or less. Don't over-order the rest.","point"],
    render(c, done){
      const items=[
        {name:"Oat Milk",emoji:"🥛",cover:1},
        {name:"Espresso Beans",emoji:"🫘",cover:2},
        {name:"Croissant Dough",emoji:"🥐",cover:0.5},
        {name:"Full Cream Milk",emoji:"🥛",cover:3},
        {name:"Takeaway Cups",emoji:"🥤",cover:14},
        {name:"Napkins",emoji:"🧻",cover:25},
        {name:"Sugar Sticks",emoji:"🧂",cover:18},
      ];
      const selected=new Set();
      c.appendChild(el("div",{class:"prompt"},["Tap the items to reorder now (≤ 3 days of cover):"]));
      const list=el("div",{class:"list"});
      items.forEach((it,i)=>{
        const coverColor = it.cover<=1 ? "var(--red)" : it.cover<=3 ? "var(--amber)" : "var(--green)";
        const check=el("div",{class:"check"},["✓"]);
        const row=el("div",{class:"lrow pick"},[
          el("div",{class:"lico"},[it.emoji]),
          el("div",{class:"lbody"},[
            el("div",{class:"lname"},[it.name]),
            el("div",{class:"lmeta",html:`<span class="cover" style="color:${coverColor}">${it.cover} day${it.cover===1?"":"s"}</span> of cover left`})
          ]),
          check
        ]);
        row.addEventListener("click",()=>{
          if(selected.has(i)){ selected.delete(i); row.classList.remove("sel"); }
          else { selected.add(i); row.classList.add("sel"); sfx.tap(); }
        });
        list.appendChild(row);
      });
      c.appendChild(list);
      const submit=el("button",{class:"btn btn-primary"},["Submit order"]);
      c.appendChild(el("div",{class:"btn-row"},[submit]));
      submit.addEventListener("click",()=>{
        submit.disabled=true;
        const ideal=new Set(items.map((it,i)=>it.cover<=3?i:-1).filter(i=>i>=0));
        let wrong=0;
        list.querySelectorAll(".lrow").forEach((row,i)=>{
          row.classList.remove("pick");
          const shouldOrder=ideal.has(i), didOrder=selected.has(i);
          if(shouldOrder&&didOrder) row.classList.add("good");
          else if(!shouldOrder&&!didOrder){ /* correctly left */ }
          else { row.classList.add("bad"); wrong++; }
        });
        const score=Math.max(0,100-wrong*22);
        if(wrong===0){ sfx.good(); confetti(); say("Spot on — shelves stay full, nothing wasted.","cheer"); }
        else { sfx.bad(); say(`${wrong} off — reorder what's running low, skip the well-stocked.`,"eyes"); }
        setTimeout(()=>done(score),900);
      });
    },
    ariaWin:["You reorder exactly what's needed — that's how margins survive.","cheer"],
    ariaFail:["Reorder the low-cover items and leave the well-stocked ones alone.","eyes"],
  });

  /* ---------- 4. WHICH ANSWER IS TRUE — the moat ---------- */
  ROUNDS.push({
    id:"truth", name:"Spot the honest answer", icon:"🔍", moat:true,
    blurb:"Only one statement matches the data. ariaOS never makes numbers up.",
    teaches:"Grounded AI",
    ariaIntro:["I only say what the data supports. Pick the statement that's actually true.","point"],
    render(c, done){
      const Q=[
        { panel:dataPanel("Yesterday",[
            {n:money(1284.50),l:"Revenue"},{n:"142",l:"Sales"},{n:"Flat White ×78",l:"Top item"},{n:"8–9am",l:"Busiest hour"}
          ]),
          prompt:"Which statement is actually supported by this data?",
          options:[
            {label:"Flat White was your top seller — 78 sold.",correct:true,explain:"Straight from the panel: 78 units, the highest."},
            {label:"Revenue hit $1,580 yesterday.",explain:"Made-up figure — the data says $1,284.50. ariaOS never inflates numbers."},
            {label:"Your busiest hour was 5–6pm.",explain:"The data shows 8–9am. The real peak, not a guess."},
          ]},
        { panel:dataPanel("This week so far",[
            {n:money(5200),l:"Revenue (5 days)"},{n:money(7000),l:"Weekly target"},{n:"Sat",l:"Best day"},{n:money(1310),l:"Sat revenue"}
          ]),
          prompt:"Which insight is grounded in these numbers?",
          options:[
            {label:"You're $1,800 short of target with 2 days left.",correct:true,explain:"$7,000 − $5,200 = $1,800 still to go. Honest gap, not spin."},
            {label:"You've already smashed your weekly target.",explain:"You're at $5,200 of $7,000 — not there yet."},
            {label:"Friday was your best day.",explain:"The data names Saturday ($1,310) as the best day."},
          ]},
        { panel:dataPanel("Today",[
            {n:"96",l:"Transactions"},{n:money(7.10),l:"Avg sale"},{n:"Latte ×41",l:"Top item"},{n:"3 voids",l:"Voids"}
          ]),
          prompt:"Which is the one true statement?",
          options:[
            {label:"Average sale today was $7.10 across 96 transactions.",correct:true,explain:"Both figures are right there in the data."},
            {label:"Croissant was today's hero product.",explain:"Top item is Latte (×41). ariaOS reads the real leader."},
            {label:"There were zero voids today.",explain:"The panel shows 3 voids. She won't paper over problems."},
          ]},
      ];
      runQuiz(c, Q, done);
    },
    ariaWin:["That's the whole point — I'd rather be honest than impressive. You've got the eye for it.","cheer"],
    ariaFail:["Always check the claim against the numbers shown. The truth is in the data.","eyes"],
  });

  /* ---------- 5. CATCH THE LEAK — Find the problem ---------- */
  ROUNDS.push({
    id:"leak", name:"Catch the leak", icon:"🕵️",
    blurb:"One row in each set is bleeding money. Spot it.",
    teaches:"Fraud + profit-leak watch",
    ariaIntro:["I watch every transaction for leaks. One row here is off — find it.","point"],
    render(c, done){
      function rows(list){ // list of {t, sub}
        return el("div",{class:"panel"},[ el("div",{class:"ph"},["Activity"]),
          el("div",{class:"list"}, list.map(r=>el("div",{class:"lrow"},[
            el("div",{class:"lbody"},[el("div",{class:"lname"},[r.t]), el("div",{class:"lmeta"},[r.sub])])
          ]))) ]);
      }
      const Q=[
        { panel:rows([
            {t:"Sale #1042 · $18.40",sub:"2 coffees, 1 sandwich · card"},
            {t:"Sale #1043 · $4.50",sub:"1 flat white · cash"},
            {t:"VOID #1044 · −$42.00",sub:"voided by Jordan · no manager approval"},
            {t:"Sale #1045 · $9.00",sub:"1 sandwich · card"},
          ]),
          prompt:"Which one should Aria flag?",
          options:[
            {label:"VOID #1044 · −$42.00, no manager approval",correct:true,explain:"A large void with no approval is the classic till-skim pattern. ariaOS surfaces it instantly."},
            {label:"Sale #1042 · $18.40",explain:"A normal multi-item card sale."},
            {label:"Sale #1043 · $4.50 cash",explain:"An ordinary small cash sale."},
            {label:"Sale #1045 · $9.00",explain:"A standard sandwich sale."},
          ]},
        { panel:rows([
            {t:"Expense · Bean supplier · $320",sub:"weekly delivery · matches invoice"},
            {t:"Expense · Bean supplier · $320",sub:"same invoice #, same day — duplicate"},
            {t:"Expense · Milk · $88",sub:"weekly delivery"},
            {t:"Expense · Power bill · $210",sub:"monthly"},
          ]),
          prompt:"Where's the leak?",
          options:[
            {label:"The duplicate $320 bean-supplier charge",correct:true,explain:"Same invoice number, same day, paid twice — $320 walking out the door."},
            {label:"The $88 milk delivery",explain:"Normal weekly cost."},
            {label:"The $210 power bill",explain:"Expected monthly utility."},
            {label:"The first $320 bean charge",explain:"That one's legit — it matches the invoice. The second is the duplicate."},
          ]},
        { panel:rows([
            {t:"Sandwich · sold 9.00 · cost 3.10",sub:"margin 66%"},
            {t:"Latte · sold 4.80 · cost 1.20",sub:"margin 75%"},
            {t:"Smoothie · sold 6.50 · cost 6.20",sub:"margin 5%"},
            {t:"Cookie · sold 3.50 · cost 0.90",sub:"margin 74%"},
          ]),
          prompt:"Which product is the margin leak?",
          options:[
            {label:"Smoothie — 5% margin, basically sold at cost",correct:true,explain:"$6.20 cost on a $6.50 sale earns 30c. Reprice or rework the recipe."},
            {label:"Sandwich — 66% margin",explain:"Healthy margin."},
            {label:"Latte — 75% margin",explain:"Your strongest earner."},
            {label:"Cookie — 74% margin",explain:"Great margin on a cheap item."},
          ]},
      ];
      runQuiz(c, Q, done);
    },
    ariaWin:["Nothing gets past you. That's exactly the instinct ariaOS automates for you.","cheer"],
    ariaFail:["Look for the odd one out: unapproved voids, duplicates, near-zero margins.","eyes"],
  });

  /* ---------- 6. READ THE DAY — What's the real story ---------- */
  ROUNDS.push({
    id:"readday", name:"Read the day", icon:"📊",
    blurb:"Turn the day's numbers into the right insight.",
    teaches:"Daily briefing",
    ariaIntro:["Every morning I brief you on what actually happened. Pick the right read.","point"],
    render(c, done){
      const Q=[
        { panel:dataPanel("Today vs target",[
            {n:money(980),l:"Today"},{n:money(1100),l:"Daily target"},{n:"12–1pm",l:"Busiest hour"},{n:"Latte",l:"Hero item"}
          ]),
          prompt:"What's the honest one-line briefing?",
          options:[
            {label:"You finished $120 under target; lunch (12–1pm) carried the day.",correct:true,explain:"$1,100 − $980 = $120 short, and the data names 12–1pm as peak."},
            {label:"Record day — well above target!",explain:"You're $120 under, not above."},
            {label:"Mornings were your strongest window.",explain:"The peak was 12–1pm, the lunch rush."},
          ]},
        { panel:dataPanel("Weekend",[
            {n:money(1310),l:"Sat"},{n:money(1180),l:"Sun"},{n:money(2490),l:"Weekend total"},{n:"Croissant",l:"Hero item"}
          ]),
          prompt:"Which insight is correct?",
          options:[
            {label:"Saturday beat Sunday by $130; croissants led the weekend.",correct:true,explain:"$1,310 − $1,180 = $130, and croissant is the named hero."},
            {label:"Sunday outsold Saturday.",explain:"Saturday ($1,310) was higher than Sunday ($1,180)."},
            {label:"The weekend total was over $3,000.",explain:"It was $2,490 — don't round up what isn't there."},
          ]},
        { panel:dataPanel("This week",[
            {n:money(6800),l:"Revenue"},{n:money(6500),l:"Target"},{n:"+$300",l:"vs target"},{n:"Wed",l:"Slowest day"}
          ]),
          prompt:"What should the weekly wrap say?",
          options:[
            {label:"You beat target by $300; Wednesday is the day to shore up.",correct:true,explain:"$6,800 vs $6,500 = +$300, and Wednesday is flagged as slowest."},
            {label:"You missed target this week.",explain:"You're $300 over, not under."},
            {label:"Friday was your weakest day.",explain:"The data names Wednesday as slowest."},
          ]},
      ];
      runQuiz(c, Q, done);
    },
    ariaWin:["You read a day like an owner who's been doing this for years.","cheer"],
    ariaFail:["Compare to the target, name the real peak, and don't round numbers up.","eyes"],
  });

  /* ---------- 7. POST IT RIGHT — Turn sales into a post ---------- */
  ROUNDS.push({
    id:"social", name:"Post it right", icon:"📣",
    blurb:"Turn what actually happened into a timely, grounded post.",
    teaches:"Social media",
    ariaIntro:["I write posts from your real sales — timely and true. Pick the best one.","point"],
    render(c, done){
      const Q=[
        { panel:dataPanel("Today",[
            {n:"Pumpkin Latte",l:"Launched today"},{n:"60 sold",l:"First day"},{n:"Sunny",l:"Weather"},{n:"2pm",l:"Posting now"}
          ]),
          prompt:"Which post should Aria schedule?",
          options:[
            {label:"\"Our Pumpkin Spice Latte landed today and 60 of you already fell for it 🍂 Swing by before close!\"",correct:true,explain:"Timely (launch day), grounded (60 sold), and has a call to action while you're still open."},
            {label:"\"Happy Monday everyone! Come visit us sometime ☕\"",explain:"Generic and timeless — ignores the actual launch worth shouting about."},
            {label:"\"Beat the winter chill with our hot soup range!\"",explain:"Off — it's sunny and you launched a latte, not soup."},
          ]},
        { panel:dataPanel("This morning",[
            {n:"Croissants",l:"Sold out by"},{n:"10:30am",l:"Sell-out time"},{n:"Fresh batch",l:"11:15am"},{n:"11am",l:"Posting now"}
          ]),
          prompt:"What's the smart post right now?",
          options:[
            {label:"\"Croissants flew out by 10:30 — fresh batch landing at 11:15. Get them while they're warm 🥐\"",correct:true,explain:"Uses the real sell-out, gives a reason to come now, and a precise time."},
            {label:"\"We sell croissants.\"",explain:"True but lifeless — no hook, no timing."},
            {label:"\"Sorry, we're out of everything today!\"",explain:"Inaccurate and off-putting — a fresh batch is 15 minutes away."},
          ]},
        { panel:dataPanel("Friday",[
            {n:"Live music",l:"Tonight 6pm"},{n:"Quiet",l:"Fri evenings"},{n:"New menu",l:"Just dropped"},{n:"3pm",l:"Posting now"}
          ]),
          prompt:"Pick the post that drives tonight's traffic.",
          options:[
            {label:"\"Live music from 6pm tonight + our new menu just dropped 🎶 Perfect excuse for a Friday night out.\"",correct:true,explain:"Promotes the event before it happens, ties in the new menu, aimed at the quiet window you want to fill."},
            {label:"\"Throwback to last week's gig!\"",explain:"Backward-looking — does nothing for tonight's empty tables."},
            {label:"\"We're closed this evening.\"",explain:"False — there's live music at 6pm."},
          ]},
      ];
      runQuiz(c, Q, done);
    },
    ariaWin:["Timely, true, and worth clicking — that's how real sales become a full room.","cheer"],
    ariaFail:["Lead with what actually happened, add a reason to come now.","eyes"],
  });

  /* ---------- 8. LOCK THE WEEKLY ORDER — Order for the week ---------- */
  ROUNDS.push({
    id:"weekly", name:"Lock the weekly order", icon:"🗓️",
    blurb:"Set supplier quantities to cover next week — no gaps, no waste.",
    teaches:"Weekly order + forecast",
    ariaIntro:["Order roughly: last week's usage minus what's still in stock. I'll flag gaps & waste.","point"],
    render(c, done){
      const items=[
        {name:"Oat Milk",emoji:"🥛",unit:"cartons",usage:24,stock:5},
        {name:"Espresso Beans",emoji:"🫘",unit:"kg",usage:8,stock:2},
        {name:"Takeaway Cups",emoji:"🥤",unit:"sleeves",usage:10,stock:9},
        {name:"Vanilla Syrup",emoji:"🍯",unit:"bottles",usage:3,stock:4},
      ];
      items.forEach(it=>{ it.ideal=Math.max(0,it.usage-it.stock); it.qty=0; });
      c.appendChild(el("div",{class:"prompt"},["Set how many to order for next week:"]));
      const list=el("div",{class:"list"});
      const valEls=[];
      items.forEach((it,i)=>{
        const valEl=el("span",{class:"val"},["0"]); valEls.push(valEl);
        const dec=el("button",{},["−"]), inc=el("button",{},["+"]);
        dec.addEventListener("click",()=>{ if(it.qty>0){ it.qty--; valEl.textContent=it.qty; sfx.tap(); } });
        inc.addEventListener("click",()=>{ if(it.qty<60){ it.qty++; valEl.textContent=it.qty; sfx.tap(); } });
        const row=el("div",{class:"lrow"},[
          el("div",{class:"lico"},[it.emoji]),
          el("div",{class:"lbody"},[
            el("div",{class:"lname"},[it.name]),
            el("div",{class:"lmeta"},[`Used ${it.usage} ${it.unit}/wk · ${it.stock} in stock`])
          ]),
          el("div",{class:"stepper"},[dec, valEl, inc])
        ]);
        it._row=row;
        list.appendChild(row);
      });
      c.appendChild(list);
      const submit=el("button",{class:"btn btn-primary"},["Lock order"]);
      c.appendChild(el("div",{class:"btn-row"},[submit]));
      submit.addEventListener("click",()=>{
        submit.disabled=true;
        let absErr=0, idealSum=0;
        items.forEach(it=>{
          absErr+=Math.abs(it.qty-it.ideal); idealSum+=it.ideal;
          const diff=it.qty-it.ideal;
          const fb=el("div",{class:"fb "+(Math.abs(diff)<=1?"ok":"warn")});
          if(Math.abs(diff)<=1){ fb.textContent="✓ good call ("+it.ideal+" needed)"; it._row.classList.add("good"); }
          else if(diff<0){ fb.textContent="⚠ short — you'll run out (needed ~"+it.ideal+")"; it._row.classList.add("bad"); }
          else { fb.textContent="⚠ over-ordering — that's waste (needed ~"+it.ideal+")"; it._row.classList.add("bad"); }
          it._row.querySelector(".lbody").appendChild(fb);
        });
        const score=Math.max(0,Math.round(100-(absErr/Math.max(1,idealSum))*100));
        if(score>=85){ sfx.good(); confetti(); say("Dialled in — full shelves, nothing wasted.","cheer"); }
        else { sfx.bad(); say("Close — match usage minus stock, and watch the over-orders.","eyes"); }
        setTimeout(()=>done(score),1100);
      });
    },
    ariaWin:["That's forecasting — you order for the week ahead, not the week behind.","cheer"],
    ariaFail:["Order about (last week's usage − current stock). I'll always flag the gaps.","eyes"],
  });

  /* ============================================================
     MENU + ROUND LIFECYCLE
     ============================================================ */
  function totalStars(){ return ROUNDS.reduce((s,r)=>s+(bestStars[r.id]||0),0); }
  function syncHUD(){
    $("hudStars").textContent = totalStars();
    const certified = ROUNDS.every(r=>(bestStars[r.id]||0)>=2);
    $("certBadge").classList.toggle("hidden", !certified);
  }

  function renderMenu(){
    setPose("welcome");
    say("Pick a challenge — let's see what you've got ☕");
    view.innerHTML="";
    const head=el("div",{class:"menu-head"},[
      el("h2",{},["Choose your challenge"]),
      el("p",{},["Eight quick rounds. Each one teaches a piece of ariaOS — and shows how she really thinks. Earn 2★+ on all eight to get Certified."])
    ]);
    view.appendChild(head);
    const cards=el("div",{class:"cards"});
    ROUNDS.forEach(r=>{
      const best=bestStars[r.id]||0;
      const starHTML = "★".repeat(best)+`<span class="e">${"★".repeat(3-best)}</span>`;
      const card=el("div",{class:"rcard"},[
        r.moat ? el("div",{class:"moat"},["the moat"]) : null,
        el("div",{class:"ico"},[r.icon]),
        el("div",{class:"nm"},[r.name]),
        el("div",{class:"bl"},[r.blurb]),
        el("div",{class:"teaches"},[r.teaches]),
        el("div",{class:"rstars",html:starHTML})
      ]);
      card.addEventListener("click",()=>{ ac(); playRound(r); });
      cards.appendChild(card);
    });
    view.appendChild(cards);
    syncHUD();
  }

  function playRound(r){
    view.innerHTML="";
    const back=el("button",{class:"btn-back"},["← Menu"]);
    back.addEventListener("click",renderMenu);
    const top=el("div",{class:"round-top"},[
      el("div",{class:"round-title"},[
        el("span",{class:"ico"},[r.icon]),
        el("div",{},[ el("h2",{},[r.name]), el("div",{class:"tch"},[r.teaches]) ])
      ]),
      back
    ]);
    const body=el("div",{});
    const round=el("div",{class:"round"},[top, body]);
    view.appendChild(round);
    if(r.ariaIntro) say(r.ariaIntro[0], r.ariaIntro[1]); else setPose("point");

    let completed=false;
    r.render(body, score=>{
      if(completed) return; completed=true;
      finishRound(r, score);
    });
  }

  function finishRound(r, score){
    score=Math.max(0,Math.min(100,Math.round(score)));
    const stars=starsFor(score);
    if(stars > (bestStars[r.id]||0)) bestStars[r.id]=stars;
    syncHUD();

    let verdict, line, pose;
    if(stars===3){ verdict="Verdict: ariaOS-ready ☕"; [line,pose]=r.ariaWin||["Beautifully done.","cheer"]; }
    else if(stars===2){ verdict="Solid — nearly perfect."; [line,pose]=["A little sharper next time and it's three stars.","point"]; }
    else { verdict="Worth another go."; [line,pose]=r.ariaFail||["Give it another run — you've got this.","eyes"]; }

    $("endRoundName").textContent=r.name;
    $("endStars").textContent=starStr(stars);
    $("endScore").textContent=score;
    $("endVerdict").textContent=verdict;
    $("endAria").textContent=line;
    setPose(pose);
    if(stars>=2){ sfx.win(); confetti(); } else sfx.bad();
    $("endOverlay").classList.add("show");

    $("endRetry").onclick=()=>{ $("endOverlay").classList.remove("show"); playRound(r); };
    $("endMenu").onclick=()=>{ $("endOverlay").classList.remove("show"); renderMenu(); };
  }

  /* ---- boot ---- */
  renderMenu();
})();
