"""Local only: serve real release files at the same URL, without an asset fallback."""
import gzip,tarfile,tempfile,shutil,os,mimetypes,json,sys
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit,unquote
old=Path('release-artifacts/migration-final-site').resolve()
# Expand archive once to a temporary file; only its contents are served in RC mode.
def unpack(path):
 raw=tempfile.TemporaryFile()
 with gzip.open(path,'rb') as gz: shutil.copyfileobj(gz,raw,1024*1024)
 raw.seek(0);entries={}
 with tarfile.open(fileobj=raw,mode='r|') as tar:
  for m in tar:
   assert m.isfile() and m.name not in entries
   entries[m.name]=(m.offset_data,m.size)
 return raw,entries
raw,entries=unpack(sys.argv[1])
rollback=unpack(sys.argv[2]) if len(sys.argv)>2 else None
mode='old'
class Server(BaseHTTPRequestHandler):
 def log_message(self,*args): pass
 def reply(self,data,mime):
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def do_POST(self):
  global mode
  if self.path!='/switch' or self.headers.get('Origin')!='http://127.0.0.1:'+str(self.server.server_port):return self.send_error(403)
  target=self.rfile.read(int(self.headers.get('Content-Length',0))).decode()
  if target not in ('old','rc','earlier'):return self.send_error(400)
  mode=target;self.reply(target.encode(),'text/plain')
 def do_GET(self):
  path=unquote(urlsplit(self.path).path)
  if path in ['/upgrade-lab.html','/upgrade-lab.js','/retirement-lab.html','/retirement-lab.js','/slim-lab.js','/slim-lab.html','/slim-cases.json']:
   return self.reply((Path(__file__).parent/path[1:]).read_bytes(),mimetypes.guess_type(path)[0] or 'application/octet-stream')
  if not path.startswith('/shiju/'):return self.send_error(404)
  name=path[7:] or 'index.html'
  if '..' in name.split('/') or name.startswith('/'):return self.send_error(400)
  try:
   if mode=='earlier':data=(old.parent/'rollback-20261030-site'/name).read_bytes()
   elif mode=='old' and rollback:
    stream,idx=rollback;offset,size=idx[name];data=os.pread(stream.fileno(),size,offset)
   elif mode=='old':data=(old/name).read_bytes()
   else:
    offset,size=entries[name];data=os.pread(raw.fileno(),size,offset)
  except (KeyError,OSError):return self.send_error(404)
  self.reply(data,mimetypes.guess_type(name)[0] or 'application/octet-stream')
server=ThreadingHTTPServer(('127.0.0.1',0),Server)
print('http://127.0.0.1:'+str(server.server_port)+'/upgrade-lab.html',len(entries),sum(n for _,n in entries.values()),flush=True)
server.serve_forever()
