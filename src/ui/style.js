export const CSS = `
:root{--cream:#fbf4e4;--cream2:#f3e7cc;--brown:#5a4330;--brown2:#8a6a4a;--line:#d9c49e;--green:#6fa65a;--green2:#4f8a3c;--orange:#e89a45;--red:#d9604a;--blue:#5ea3dc;
--font:"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC","Noto Sans CJK SC","Source Han Sans SC","WenQuanYi Micro Hei",system-ui,sans-serif;}
#ui{position:fixed;inset:0;pointer-events:none;font-family:var(--font);color:var(--brown);user-select:none;-webkit-user-select:none;z-index:10;}
#ui *{box-sizing:border-box;}
#ui .pe{pointer-events:auto;}
.card{background:rgba(251,244,228,.92);border:2px solid rgba(138,106,74,.55);border-radius:16px;box-shadow:0 6px 18px rgba(60,40,20,.18),inset 0 1px 0 rgba(255,255,255,.7);}
.hud-tl{position:absolute;left:16px;top:14px;display:flex;gap:10px;align-items:stretch;}
.datecard{padding:8px 14px 8px 10px;display:flex;align-items:center;gap:10px;min-width:188px;}
.datecard .wx{width:40px;height:40px;flex:none;}
.datecard .wx svg{width:100%;height:100%;}
.datecard .d1{font-size:17px;font-weight:700;letter-spacing:.5px;}
.datecard .d2{font-size:14px;opacity:.85;display:flex;gap:8px;align-items:center;margin-top:2px;font-variant-numeric:tabular-nums;}
.dial{width:40px;height:40px;flex:none;position:relative;}
.coins{padding:8px 14px;display:flex;align-items:center;gap:8px;font-weight:700;font-size:18px;font-variant-numeric:tabular-nums;}
.coins svg{width:24px;height:24px;}
.coins.bump{animation:bump .35s ease;}
@keyframes bump{40%{transform:scale(1.12)}}
.speed{padding:0 12px;display:flex;align-items:center;font-weight:700;font-size:14px;cursor:pointer;}
.speed:hover{background:#fff8ea;}
.hud-tr{position:absolute;right:16px;top:14px;display:flex;flex-direction:column;align-items:flex-end;gap:10px;}
.btnrow{display:flex;gap:8px;}
.ibtn{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;transition:transform .12s;}
.ibtn svg{width:28px;height:28px;}
.ibtn:hover{transform:translateY(-2px);background:#fffaf0;}
.ibtn .k{position:absolute;bottom:-4px;right:-4px;font-size:10px;background:var(--brown2);color:#fff;border-radius:6px;padding:1px 4px;font-weight:700;}
.minimap{width:172px;height:172px;border-radius:20px;overflow:hidden;position:relative;padding:0;}
.minimap canvas{width:100%;height:100%;display:block;border-radius:18px;}
.hotbar{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:flex;gap:6px;padding:7px;}
.slot{width:56px;height:56px;border-radius:12px;background:rgba(255,255,255,.55);border:2px solid rgba(138,106,74,.35);position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .1s,border-color .1s;}
.slot:hover{transform:translateY(-2px);}
.slot.sel{border-color:#e89a45;background:#fff6dc;box-shadow:0 0 0 3px rgba(232,154,69,.35);transform:translateY(-4px);}
.slot svg{width:38px;height:38px;}
.slot .emo{font-size:30px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.2));}
.slot .seedbag{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}
.slot .seedbag::before{content:"";position:absolute;width:36px;height:40px;border-radius:8px 8px 10px 10px;background:#e9d3a6;border:2px solid #b08a5a;top:8px;}
.slot .seedbag .emo{position:relative;font-size:22px;margin-top:4px;}
.slot .num{position:absolute;left:4px;top:1px;font-size:11px;font-weight:700;opacity:.6;}
.slot .cnt{position:absolute;right:3px;bottom:1px;font-size:12px;font-weight:800;color:#fff;text-shadow:0 0 3px #5a4330,0 0 2px #5a4330;}
.slot.empty .seedbag,.slot.empty .emo{opacity:.35;filter:grayscale(1);}
.slot .wbar{position:absolute;left:6px;right:6px;bottom:4px;height:5px;border-radius:3px;background:rgba(90,67,48,.25);overflow:hidden;}
.slot .wbar i{display:block;height:100%;background:linear-gradient(90deg,#4f9ad8,#8fd0ff);}
.toolname{position:absolute;left:50%;bottom:86px;transform:translateX(-50%);font-size:14px;font-weight:700;padding:4px 12px;border-radius:10px;background:rgba(90,67,48,.75);color:#fff;opacity:0;transition:opacity .3s;white-space:nowrap;}
.toolname.show{opacity:1;}
.prompt{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);padding:7px 14px;font-size:15px;font-weight:600;display:none;align-items:center;gap:8px;white-space:nowrap;}
.prompt.show{display:flex;}
kbd{display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border-radius:7px;background:#fff;border:2px solid var(--brown2);border-bottom-width:3px;font-family:var(--font);font-size:12px;font-weight:800;color:var(--brown);}
.toasts{position:absolute;left:50%;top:16px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px;}
.toast{padding:8px 16px;font-size:15px;font-weight:600;animation:tin .3s ease;white-space:nowrap;display:flex;gap:8px;align-items:center;}
.toast.out{animation:tout .4s ease forwards;}
.toast.good{border-color:rgba(79,138,60,.7);} .toast.bad{border-color:rgba(217,96,74,.7);}
@keyframes tin{from{opacity:0;transform:translateY(-10px)}}
@keyframes tout{to{opacity:0;transform:translateY(-8px)}}
.power{position:absolute;width:22px;height:130px;padding:3px;border-radius:12px;display:none;}
.power i{position:absolute;left:3px;right:3px;bottom:3px;border-radius:8px;background:linear-gradient(0deg,#6fa65a,#f2c14e 60%,#e8603c);}
.power.show{display:block;}
.bite{position:absolute;font-size:44px;font-weight:900;color:#fff;-webkit-text-stroke:2px #d9604a;text-shadow:0 3px 0 #d9604a;display:none;transform:translate(-50%,-100%);animation:bite .4s ease infinite alternate;}
.bite.show{display:block;}
@keyframes bite{to{transform:translate(-50%,-112%) scale(1.15)}}
.reel{position:absolute;display:none;gap:8px;padding:10px;align-items:stretch;}
.reel.show{display:flex;}
.reel .track{width:40px;height:270px;border-radius:12px;background:linear-gradient(180deg,#bfe0ef,#4f8fb3);position:relative;overflow:hidden;border:2px solid #3f6f8c;}
.reel .track::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.06) 0 8px,transparent 8px 16px);}
.reel .zone{position:absolute;left:3px;right:3px;border-radius:8px;background:rgba(140,220,110,.7);border:2px solid #4f8a3c;box-shadow:0 0 10px rgba(160,255,120,.5);}
.reel .zone.out{background:rgba(140,220,110,.4);}
.reel .fish{position:absolute;left:50%;width:34px;height:22px;transform:translate(-50%,50%);}
.reel .prog{width:12px;height:270px;border-radius:7px;background:rgba(90,67,48,.2);position:relative;overflow:hidden;border:2px solid rgba(90,67,48,.4);}
.reel .prog i{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,#e8603c,#f2c14e 40%,#6fa65a 80%);}
.reel .tip{position:absolute;left:50%;bottom:-30px;transform:translateX(-50%);font-size:12px;white-space:nowrap;font-weight:700;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);}
.reel.shake .track{animation:shk .12s linear infinite;}
@keyframes shk{25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}
.catch{position:absolute;left:50%;top:84px;transform:translateX(-50%);padding:14px 22px;display:none;align-items:center;gap:16px;min-width:320px;}
.catch.show{display:flex;animation:pop .45s cubic-bezier(.2,1.6,.4,1);}
@keyframes pop{from{transform:translateX(-50%) scale(.6);opacity:0}}
.catch .nm{font-size:22px;font-weight:800;}
.catch .meta{font-size:14px;opacity:.85;margin-top:4px;}
.badge{display:inline-block;font-size:12px;font-weight:800;padding:2px 8px;border-radius:8px;background:#e89a45;color:#fff;margin-left:6px;vertical-align:middle;}
.badge.g{background:var(--green);}
.modal-bg{position:absolute;inset:0;background:rgba(40,30,20,.32);display:none;align-items:center;justify-content:center;pointer-events:auto;backdrop-filter:blur(2px);}
.modal-bg.show{display:flex;}
.panel{width:min(760px,94vw);max-height:86vh;display:flex;flex-direction:column;padding:0;overflow:hidden;animation:pin .25s ease;background:var(--cream);border:3px solid var(--brown2);border-radius:20px;}
@keyframes pin{from{transform:translateY(16px) scale(.97);opacity:0}}
.panel .hd{display:flex;align-items:center;gap:10px;padding:14px 18px;background:linear-gradient(180deg,#f6e3bd,#efd7a8);border-bottom:2px solid var(--line);}
.panel .hd h2{margin:0;font-size:20px;flex:1;}
.panel .hd .x{width:34px;height:34px;border-radius:10px;border:2px solid var(--brown2);background:#fff8ea;cursor:pointer;font-size:18px;font-weight:800;color:var(--brown);display:flex;align-items:center;justify-content:center;}
.panel .bd{padding:14px 18px;overflow:auto;}
.panel .ft{padding:12px 18px;border-top:2px solid var(--line);display:flex;gap:10px;justify-content:flex-end;align-items:center;background:#f7ecd4;}
.tabs{display:flex;gap:6px;margin-bottom:12px;}
.tab{padding:6px 14px;border-radius:10px;border:2px solid var(--line);background:#fff8ea;cursor:pointer;font-weight:700;font-size:14px;}
.tab.on{background:var(--brown2);color:#fff;border-color:var(--brown2);}
.row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;background:#fffaf0;border:2px solid #eedfbf;margin-bottom:8px;}
.row .ic{width:46px;height:46px;border-radius:12px;background:#f3e7cc;display:flex;align-items:center;justify-content:center;font-size:28px;flex:none;}
.row .ic svg{width:40px;}
.row .tx{flex:1;min-width:0;}
.row .tx b{font-size:16px;}
.row .tx .s{font-size:13px;opacity:.75;margin-top:2px;}
.row .pr{font-weight:800;white-space:nowrap;font-variant-numeric:tabular-nums;}
.btn{padding:7px 14px;border-radius:11px;border:2px solid var(--green2);background:var(--green);color:#fff;font-weight:800;font-size:14px;cursor:pointer;font-family:var(--font);white-space:nowrap;box-shadow:0 2px 0 var(--green2);}
.btn:hover{filter:brightness(1.06);} .btn:active{transform:translateY(1px);box-shadow:none;}
.btn.alt{background:#fff8ea;color:var(--brown);border-color:var(--brown2);box-shadow:0 2px 0 var(--brown2);}
.btn.warn{background:var(--red);border-color:#a8442f;box-shadow:0 2px 0 #a8442f;}
.btn[disabled]{opacity:.45;cursor:not-allowed;filter:grayscale(.6);}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;}
.fcard{padding:10px;border-radius:14px;background:#fffaf0;border:2px solid #eedfbf;text-align:center;}
.fcard .nm{font-weight:800;margin-top:4px;}
.fcard .s{font-size:12px;opacity:.75;margin-top:3px;line-height:1.5;}
.fcard.no{opacity:.75;}
.set{display:flex;align-items:center;gap:12px;padding:10px 4px;border-bottom:1px dashed var(--line);}
.set label{width:110px;font-weight:700;}
.set input[type=range]{flex:1;accent-color:#e89a45;}
.seg{display:flex;gap:6px;flex-wrap:wrap;}
.help h3{margin:10px 0 6px;font-size:16px;}
.help table{border-collapse:collapse;width:100%;font-size:14px;}
.help td{padding:5px 6px;border-bottom:1px dashed var(--line);vertical-align:middle;}
.help td:first-child{width:180px;white-space:nowrap;}
.help p{margin:6px 0;font-size:14px;line-height:1.7;}
.stat{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:6px;}
.stat div{background:#fffaf0;border:2px solid #eedfbf;border-radius:12px;padding:8px;text-align:center;font-size:13px;}
.stat b{display:block;font-size:20px;}
.chips{display:flex;flex-wrap:wrap;gap:8px;}
.chip{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:12px;background:#fffaf0;border:2px solid #eedfbf;font-weight:700;}
.chip .e{font-size:22px;} .chip svg{width:36px;}
.sec{font-weight:800;margin:12px 0 8px;font-size:15px;opacity:.85;}
.empty-note{opacity:.6;font-size:14px;padding:8px 2px;}
.fade{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;color:#fff8ea;text-align:center;pointer-events:auto;}
.fade.show{display:flex;}
.fade .big{font-size:46px;font-weight:800;letter-spacing:4px;text-shadow:0 4px 18px rgba(0,0,0,.5);opacity:0;transition:opacity .8s;}
.fade .sub{font-size:18px;margin-top:12px;opacity:0;transition:opacity .8s .3s;line-height:1.8;}
.fade.txt .big,.fade.txt .sub{opacity:1;}
.title{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 30%,rgba(30,20,10,.35) 100%);}
.title.show{display:flex;}
.title h1{margin:0;font-size:84px;letter-spacing:12px;color:#fffaf0;text-shadow:0 4px 0 #8a6a4a,0 8px 30px rgba(40,25,10,.55);font-weight:900;}
.title .sub{font-size:18px;color:#fffaf0;text-shadow:0 2px 8px rgba(40,25,10,.7);margin:10px 0 34px;letter-spacing:3px;}
.title .menu{display:flex;flex-direction:column;gap:12px;width:240px;}
.title .menu .btn{font-size:19px;padding:12px 18px;border-radius:16px;}
.title .foot{position:absolute;bottom:20px;font-size:13px;color:#fffaf0;opacity:.85;text-shadow:0 1px 4px rgba(0,0,0,.6);}
.loading{position:fixed;inset:0;background:#e9dcc0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:20;font-family:var(--font);color:#5a4330;transition:opacity .6s;}
.loading h1{font-size:46px;letter-spacing:8px;margin:0 0 18px;}
.loading .bar{width:260px;height:10px;border-radius:6px;background:rgba(90,67,48,.2);overflow:hidden;}
.loading .bar i{display:block;height:100%;width:0;background:#6fa65a;transition:width .2s;}
.loading .msg{margin-top:12px;font-size:15px;opacity:.8;}
.hint{position:absolute;left:16px;bottom:16px;font-size:12.5px;line-height:1.75;padding:8px 12px;max-width:290px;opacity:.95;}
.hint b{color:#8a5a2e;}
.dialog{width:min(420px,92vw);}
.dialog .bd{font-size:16px;line-height:1.8;text-align:center;padding:22px;}
.sign{font-size:15px;line-height:2;}
.sign div{display:flex;gap:10px;align-items:center;}
.sign span{font-size:22px;width:30px;text-align:center;}
@media (max-width:1360px){.hint{bottom:98px;font-size:12px;line-height:1.65;}}
@media (max-width:800px){.hint{display:none}.title h1{font-size:56px}.slot{width:46px;height:46px}.slot svg{width:30px;height:30px}.minimap{width:120px;height:120px}}
`;
