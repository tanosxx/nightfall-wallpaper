import json
import sys
from pathlib import Path
import gi
gi.require_version('Gst','1.0')
gi.require_version('GstPbutils','1.0')
from gi.repository import Gst, GstPbutils
Gst.init(None)
info=json.loads(Path(sys.argv[1]).read_text())
out=Path(sys.argv[2]).resolve()
out.parent.mkdir(parents=True,exist_ok=True)
quote=lambda s: '"'+str(s).replace('\\','\\\\').replace('"','\\"')+'"'
pipeline=Gst.parse_launch('multifilesrc location='+quote(info['folder']+'/frame-%04d.png')+' index=0 stop-index=191 caps="image/png,framerate=(fraction)24/1" ! pngdec ! videoconvert ! video/x-raw,format=I420 ! x264enc bitrate=6500 speed-preset=medium tune=zerolatency key-int-max=48 ! video/x-h264,stream-format=avc,alignment=au ! mp4mux faststart=true ! filesink location='+quote(out))
pipeline.set_state(Gst.State.PLAYING)
message=pipeline.get_bus().timed_pop_filtered(180*Gst.SECOND,Gst.MessageType.EOS|Gst.MessageType.ERROR)
pipeline.set_state(Gst.State.NULL)
if message is None: raise RuntimeError('Encoding timed out')
if message.type==Gst.MessageType.ERROR: raise RuntimeError(str(message.parse_error()))
d=GstPbutils.Discoverer.new(10*Gst.SECOND)
video=d.discover_uri(out.as_uri())
streams=video.get_video_streams()
assert len(streams)==1
s=streams[0]
result={**info,'file':str(out),'bytes':out.stat().st_size,'encodedDuration':video.get_duration()/Gst.SECOND,'encodedWidth':s.get_width(),'encodedHeight':s.get_height(),'encodedFps':[s.get_framerate_num(),s.get_framerate_denom()],'encoder':'GStreamer x264enc / H.264 MP4'}
assert result['encodedWidth']==1280 and result['encodedHeight']==720
assert result['encodedFps']==[24,1] and abs(result['encodedDuration']-8)<.1
print(json.dumps(result,ensure_ascii=False))
out.with_suffix('.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
