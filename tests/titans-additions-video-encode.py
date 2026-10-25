"""Encode the native review frames as an actual playable H.264 artifact."""
import json
import sys
from pathlib import Path
import gi
gi.require_version('Gst', '1.0')
gi.require_version('GstPbutils', '1.0')
from gi.repository import Gst, GstPbutils
Gst.init(None)
info = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2]).resolve()
out.parent.mkdir(parents=True, exist_ok=True)
quote = lambda value: '"' + str(value).replace('\\', '\\\\').replace('"', '\\"') + '"'
pipeline = Gst.parse_launch(
    'multifilesrc location=' + quote(info['folder'] + '/frame-%04d.png')
    + f' index=0 stop-index={info["frames"] - 1} caps="image/png,framerate=(fraction){info["fps"]}/1"'
    + ' ! pngdec ! videoconvert ! video/x-raw,format=I420 ! x264enc bitrate=6500 speed-preset=medium tune=zerolatency key-int-max=48'
    + ' ! video/x-h264,stream-format=avc,alignment=au ! mp4mux faststart=true ! filesink location=' + quote(out))
pipeline.set_state(Gst.State.PLAYING)
message = pipeline.get_bus().timed_pop_filtered(180 * Gst.SECOND, Gst.MessageType.EOS | Gst.MessageType.ERROR)
pipeline.set_state(Gst.State.NULL)
if message is None:
    raise RuntimeError('Encoding timed out')
if message.type == Gst.MessageType.ERROR:
    raise RuntimeError(str(message.parse_error()))
video = GstPbutils.Discoverer.new(10 * Gst.SECOND).discover_uri(out.as_uri())
streams = video.get_video_streams()
assert len(streams) == 1
stream = streams[0]
result = {**info, 'file': str(out), 'bytes': out.stat().st_size,
          'encodedDuration': video.get_duration() / Gst.SECOND,
          'encodedWidth': stream.get_width(), 'encodedHeight': stream.get_height(),
          'encodedFps': [stream.get_framerate_num(), stream.get_framerate_denom()],
          'encoder': 'GStreamer x264enc / H.264 MP4'}
assert result['encodedWidth'] == info['width'] and result['encodedHeight'] == info['height']
assert result['encodedFps'] == [info['fps'], 1] and abs(result['encodedDuration'] - info['duration']) < .1
out.with_suffix('.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
print(json.dumps(result, ensure_ascii=False))
