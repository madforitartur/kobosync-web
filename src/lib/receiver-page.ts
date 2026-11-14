/** HTML da página que se abre no browser do Kobo (ES5 simples, sem dependências). */
export function renderReceiverPage({ host, code, secret, qr }: { host: string; code: string; secret: string; qr: string }): string {
  return `<!doctype html>
<html lang="pt-PT"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KoboSync · Receber livros</title>
<style>
body{font-family:Georgia,serif;margin:0;padding:18px;background:#fff;color:#000;text-align:center}
h1{font-size:22px;margin:6px 0}
.code{font:bold 64px/1.1 monospace;letter-spacing:12px;border:4px solid #000;display:inline-block;padding:10px 12px 10px 24px;margin:14px 0}
p{font-size:17px;line-height:1.4;margin:8px auto;max-width:560px}
svg{width:170px;height:170px}
ul{list-style:none;padding:0;margin:16px auto;max-width:560px;text-align:left}
li{border:2px solid #000;margin:8px 0}
li a{display:block;padding:14px;color:#000;font-size:19px;text-decoration:none}
li a b{display:block}
li.done a{background:#ddd}
button{font-size:17px;padding:10px 16px;border:2px solid #000;background:#fff;margin-top:10px}
small{color:#444}
</style></head><body>
<h1>Receber livros no Kobo</h1>
<p>No telemóvel ou computador abre <b>${host}/kobo</b> e escreve este código (ou lê o QR):</p>
<div class="code" id="code">${code}</div>
<div id="qr">${qr}</div>
<p id="status">À espera dos livros…</p>
<ul id="files"></ul>
<p><small>Toca num livro para o descarregar; o Kobo importa-o para a biblioteca. Esta página fecha o código passados alguns minutos.</small></p>
<button onclick="location.reload()">Novo código</button>
<script>
(function(){
  var code=${JSON.stringify(code)},secret=${JSON.stringify(secret)};
  var ul=document.getElementById('files'),st=document.getElementById('status'),shown=0,failures=0;
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  function render(files){
    for(var i=shown;i<files.length;i++){
      var li=document.createElement('li');
      li.innerHTML='<a href="'+files[i].url+'"><b>'+esc(files[i].title)+'</b>Tocar para descarregar</a>';
      li.firstChild.onclick=(function(l){return function(){l.className='done';};})(li);
      ul.appendChild(li);
    }
    shown=files.length;
    st.innerHTML=files.length?files.length+(files.length===1?' livro pronto':' livros prontos')+':':'À espera dos livros…';
  }
  function poll(){
    var x=new XMLHttpRequest();
    x.open('GET','/api/receber/poll?code='+code+'&secret='+secret+'&t='+(+new Date()),true);
    x.onreadystatechange=function(){
      if(x.readyState!==4)return;
      if(x.status===200){
        failures=0;
        try{var d=JSON.parse(x.responseText);}catch(e){return setTimeout(poll,4000);}
        if(d.expired){st.innerHTML='Código expirado. Toca em "Novo código".';return;}
        render(d.files);
      }else if(++failures>5){st.innerHTML='Sem ligação. Toca em "Novo código".';return;}
      setTimeout(poll,3000);
    };
    x.send();
  }
  poll();
})();
</script></body></html>`;
}
