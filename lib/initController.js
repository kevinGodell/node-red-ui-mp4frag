'use strict';

module.exports = ($scope, events) => {
  // Math.max(MAX_DURATION.seconds, MAX_DURATION.segments * MAX_DURATION.rate * lastDuration)

  const MAX_DURATION = {
    seconds: 10, //
    segments: 3, //
    rate: 1.1, // add 10% for margin of error
  };

  // todo define const for request/response socket.io comms

  const SOCKET_IO = {
    req: {
      mime: 'req_mime',
      initialization: 'req_initialization',
      segment: 'req_segment',
    },
    res: {
      mime: 'res_mime',
      initialization: 'res_initialization',
      segment: 'res_segment',
    },
  };

  const noop = () => {
    console.debug('noop()', videoElement.id);
  };

  const hasHlsJs = () => {
    return /* typeof Hls === 'function' && */ Hls.isSupported() === true;
  };

  const hasHlsNative = () => {
    return videoElement.canPlayType('application/vnd.apple.mpegurl') !== '';
  };

  const hasMediaSource = () => {
    return 'MediaSource' in window;
  };

  let loadVideo = noop;

  let unloadVideo = noop;

  let videoElement;

  // let videoIntersecting;

  // let documentVisible;

  const waitForIt = (expression, maxRetry, retryDelay) => {
    let attempt = 0;

    return new Promise((resolve, reject) => {
      const checkExpression = () => {
        if (expression() === true) {
          return resolve(true);
        }

        if (++attempt > maxRetry) {
          return reject({ expression: expression.toString(), maxRetry, retryDelay });
        }

        setTimeout(checkExpression, retryDelay);
      };

      checkExpression();
    });
  };

  const extractVideoData = payload => {
    if (!payload) {
      return {
        type: 'empty',
        source: null,
      };
    }

    const { hlsPlaylist, socketIo, mp4File } = payload;

    for (let i = 0; i < $scope.config.playerOrder.length; ++i) {
      switch ($scope.config.playerOrder[i]) {
        case 'socket.io':
          if (hasMediaSource() === true) {
            if (typeof socketIo === 'object') {
              const { namespace, path } = socketIo;

              if (typeof path === 'string' && typeof namespace === 'string') {
                return {
                  type: 'socket.io',
                  source: { path, namespace },
                };
              }
            }
          }

          break;

        case 'hls.js':
          if (hasHlsJs() === true) {
            if (typeof payload === 'string') {
              if (payload.endsWith('.m3u8') === true) {
                return {
                  type: 'hls.js',
                  source: payload,
                };
              }
            }

            if (typeof hlsPlaylist === 'string') {
              if (hlsPlaylist.endsWith('.m3u8') === true) {
                return {
                  type: 'hls.js',
                  source: hlsPlaylist,
                };
              }
            }
          }

          break;

        case 'hls':
          if (hasHlsNative() === true) {
            if (typeof payload === 'string') {
              if (payload.endsWith('.m3u8') === true) {
                return {
                  type: 'hls.js',
                  source: payload,
                };
              }
            }

            if (typeof hlsPlaylist === 'string') {
              if (hlsPlaylist.endsWith('.m3u8') === true) {
                return {
                  type: 'hls',
                  source: hlsPlaylist,
                };
              }
            }
          }

          break;

        case 'mp4':
          if (typeof payload === 'string') {
            if (payload.endsWith('.mp4') === true) {
              return {
                type: 'mp4',
                source: payload,
              };
            }
          }

          if (typeof mp4File === 'string') {
            if (mp4File.endsWith('.mp4') === true) {
              return {
                type: 'mp4',
                source: mp4File,
              };
            }
          }

          break;
      }
    }

    return {
      type: 'unknown',
      source: payload,
    };
  };

  const setVideoPoster = (errored = false) => {
    videoElement.poster = errored === true ? $scope.config.errorPoster : $scope.config.readyPoster;
  };

  const initVideo = (type, source, video) => {
    // type can be socket.io, hls.js, hls, mp4

    switch (type) {
      case 'socket.io':
        {
          let socketIo; // instanceof io.Socket
          let mediaSource; // instanceof MediaSource
          let sourceBuffer; // instanceof SourceBuffer
          let mime; // typeof string
          let lastSegment; // instanceof ArrayBuffer
          let lastTimestamp = 0;
          let lastDuration = 0;
          let lastSequence = 0;
          let lastBufferedDuration = 0;
          let socketIoLoaded = false;

          const unload = () => {
            if (socketIoLoaded === false) {
              console.debug('unload()', 'already unloaded');

              return;
            }

            socketIoLoaded = false;

            if (socketIo instanceof io.Socket === true) {
              socketIo.removeAllListeners('connect');

              socketIo.removeAllListeners('mime');

              socketIo.removeAllListeners('initialization');

              socketIo.removeAllListeners('segment');

              socketIo.disconnect();

              // socketIo.destroy();

              socketIo = undefined;
            }

            if (mediaSource instanceof MediaSource === true) {
              if (sourceBuffer instanceof SourceBuffer === true) {
                if (sourceBuffer.updating === true) {
                  sourceBuffer.abort();
                }

                mediaSource.removeSourceBuffer(sourceBuffer);

                mediaSource.endOfStream();

                sourceBuffer.onerror = undefined;

                sourceBuffer.onupdateend = undefined;

                sourceBuffer = undefined;
              }

              mediaSource.onsourceopen = undefined;

              mediaSource = undefined;
            }

            mime = undefined;

            lastSegment = undefined;

            lastTimestamp = undefined;

            lastSequence = undefined;

            lastDuration = undefined;

            // videoElement.removeAttribute('onloadedmetadata');
            videoElement.onloadedmetadata = undefined;

            videoElement.controls = false;

            try {
              videoElement.pause();
            } catch (err) {
              console.debug('videoElement.pause()', `${err.name} - ${err.message}`);
            }

            videoElement.removeAttribute('src');

            try {
              videoElement.load();
            } catch (err) {
              console.debug('videoElement.load()', `${err.name} - ${err.message}`);
            }

            // videoElement.removeAttribute('onerror');
            videoElement.onerror = undefined;
          };

          const load = () => {
            if (socketIoLoaded === true) {
              unload();
            }

            socketIoLoaded = true;

            try {
              const nsp = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${source.namespace}`;

              socketIo = io(nsp, {
                path: source.path,
                transports: [/* 'polling', */ 'websocket'],
                forceNew: false, // true,
                timeout: 5000,
              });

              // console.debug('io()', socketIo);
            } catch (err) {
              console.debug('io()', `${err.name} - ${err.message}`);

              unload();

              setVideoPoster(true);

              return;
            }

            socketIo.on('error', err => {
              console.debug('socketIo on error', err);
              // console.debug('socketIo on error', `${err.name} - ${err.message}`);
            });

            socketIo.on('connect_error', err => {
              console.debug('socketIo on connect_error', err);
            });

            socketIo.on('connect_failed', err => {
              console.debug('socketIo on connect_failed', err);
            });

            socketIo.on('disconnect', data => {
              console.debug('socketIo on disconnect', data);
            });

            socketIo.on('reconnect', data => {
              console.debug('socketIo on reconnect', data);
            });

            socketIo.on('connect', () => {
              console.debug('socketIo on connect');

              socketIo.removeAllListeners('connect');

              socketIo.emit('mime');
            });

            socketIo.on('mime', data => {
              console.debug('socketIo on mime', data);

              socketIo.removeAllListeners('mime');

              if (MediaSource.isTypeSupported(data) === false) {
                console.debug(`MediaSource.isTypeSupported(${data}) === false`);

                unload();

                setVideoPoster(true);

                return;
              }

              videoElement.onerror = err => {
                console.debug('videoElement.onerror()', `${err.name} - ${err.message}`);
              };

              videoElement.onloadedmetadata = async data => {
                console.debug('videoElement.onloadedmetadata()', data);

                try {
                  await videoElement.play();

                  videoElement.controls = true;
                } catch (err) {
                  console.debug('videoElement.play()', `${err.name} - ${err.message}`);
                }
              };

              mime = data;

              mediaSource = new MediaSource();

              mediaSource.onsourceopen = data => {
                console.debug('mediaSource.onsourceopen()', data);

                URL.revokeObjectURL(videoElement.src); // todo

                sourceBuffer = mediaSource.addSourceBuffer(mime);

                sourceBuffer.mode = 'sequence'; // or segments

                sourceBuffer.onerror = err => {
                  console.debug('sourceBuffer.onerror()', `${err.name} - ${err.message}`);
                };

                sourceBuffer.onupdateend = data => {
                  // console.debug('sourceBuffer.onupdateend()', data);

                  if (lastSegment instanceof ArrayBuffer === true) {
                    // console.debug('sourceBuffer.onupdateend()', 'lastSegment');

                    sourceBuffer.appendBuffer(lastSegment);

                    lastSegment = undefined;

                    return;
                  }

                  if (sourceBuffer.buffered.length === 0) {
                    mediaSource.duration = Number.POSITIVE_INFINITY;

                    console.debug('sourceBuffer.onupdateend()', 'request first segment');

                    socketIo.emit('segment');

                    return;
                  }

                  const bufferedStart = sourceBuffer.buffered.start(0);

                  const bufferedEnd = sourceBuffer.buffered.end(0);

                  const bufferedDuration = Math.round((bufferedEnd - bufferedStart) * 100) / 100; // vs toFixed(2)

                  const maxBufferedDuration =
                    Math.round(Math.max(MAX_DURATION.seconds, MAX_DURATION.segments * MAX_DURATION.rate * lastDuration) * 100) / 100; // vs toFixed(2)

                  if (bufferedDuration > maxBufferedDuration && bufferedDuration !== lastBufferedDuration) {
                    lastBufferedDuration = bufferedDuration;

                    const newBufferedStart = bufferedStart + (bufferedDuration - maxBufferedDuration);

                    sourceBuffer.remove(bufferedStart, newBufferedStart);

                    return;
                  }

                  if (videoElement.currentTime < bufferedStart) {
                    videoElement.currentTime = (bufferedEnd + bufferedStart) / 2;
                  }

                  // console.debug('sourceBuffer.onupdateend()', 'request next segment');

                  socketIo.emit('segment', { timestamp: lastTimestamp });
                };

                socketIo.emit('initialization');
              };

              mediaSource.onsourceclose = data => {
                console.debug('mediaSource.onsourceclose()', data);
              };

              mediaSource.onsourceclosed = data => {
                console.debug('mediaSource.onsourceclosed()', data);
              };

              mediaSource.onsourceended = data => {
                console.debug('mediaSource.onsourceended()', data);
              };

              console.debug('URL.createObjectURL(mediaSource)');

              videoElement.src = URL.createObjectURL(mediaSource); // triggers mediaSource open event
            });

            socketIo.on('initialization', data => {
              console.debug('socketIo on initialization', data);

              socketIo.removeAllListeners('initialization');

              if (data instanceof ArrayBuffer === false) {
                console.debug('data instanceof ArrayBuffer === false');

                unload();

                setVideoPoster(true);

                return;
              }

              if (sourceBuffer.updating === true) {
                console.debug('sourceBuffer.updating === true');

                unload();

                setVideoPoster(true);

                return;
              }

              sourceBuffer.appendBuffer(data);
            });

            socketIo.on('segment', data => {
              // console.debug('socketIo on segment', typeof data);

              const { segment, duration, timestamp, sequence } = data;

              if (segment instanceof ArrayBuffer === false) {
                console.debug('segment instanceof ArrayBuffer === false');

                unload();

                setVideoPoster(true);

                return;
              }

              lastTimestamp = timestamp;

              lastSequence = sequence;

              lastDuration = duration;

              if (sourceBuffer.updating === true) {
                // console.debug('socketIo on segment', 'keep lastSegment because updating true');

                lastSegment = segment;

                return;
              }

              sourceBuffer.appendBuffer(segment);
            });
          };

          return {
            load,
            unload,
          };
        }
        break;
      case 'hls.js':
        {
          let hlsJsPlayer;
          let hlsJsLoaded = false;

          const unload = () => {
            if (hlsJsLoaded === false) {
              console.debug('unload()', 'already unloaded');

              return;
            }

            hlsJsLoaded = false;

            if (typeof hlsJsPlayer === 'object' && typeof hlsJsPlayer.destroy === 'function') {
              hlsJsPlayer.destroy();

              hlsJsPlayer = undefined;
            }

            videoElement.controls = false;

            videoElement.pause();

            videoElement.removeAttribute('src');

            videoElement.load();
          };

          const load = () => {
            if (hlsJsLoaded === true) {
              unload();
            }

            hlsJsLoaded = true;

            hlsJsPlayer = new Hls($scope.config.hlsJsConfig);

            hlsJsPlayer.loadSource(source);

            hlsJsPlayer.attachMedia(videoElement);

            // todo check config.autoplay
            hlsJsPlayer.on(Hls.Events.MANIFEST_PARSED, async () => {
              try {
                await videoElement.play();

                videoElement.controls = true;
              } catch (err) {
                console.debug('videoElement.play()', `${err.name} - ${err.message}`);
              }
            });

            hlsJsPlayer.on(Hls.Events.ERROR, (event, data) => {
              const { type, details, fatal } = data;
              if (fatal) {
                switch (type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.warn({
                      type: 'Warn',
                      videoId: videoElement.id,
                      details,
                      // details: 'fatal network error encountered, try to recover',
                    });
                    hlsJsPlayer.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.warn({
                      type: 'Warn',
                      videoId: videoElement.id,
                      details,
                      // details: 'fatal media error encountered, try to recover',
                    });
                    hlsJsPlayer.recoverMediaError();
                    break;
                  case Hls.ErrorTypes.OTHER_ERROR:
                  default:
                    console.error(data);

                    unload();

                    setVideoPoster(true);

                    break;
                }
              }
            });
          };

          return {
            load,
            unload,
          };
        }
        break;
      case 'hls':
        {
          let hlsLoaded = false;

          const unload = () => {
            if (hlsLoaded === false) {
              console.debug('unload()', 'already unloaded');

              return;
            }

            hlsLoaded = false;

            videoElement.onerror = undefined;

            videoElement.onloadedmetadata = undefined;

            videoElement.controls = false;

            videoElement.pause();

            videoElement.removeAttribute('src');

            videoElement.load();
          };

          const load = () => {
            if (hlsLoaded === true) {
              unload();
            }

            hlsLoaded = true;

            videoElement.onerror = err => {
              console.debug('videoElement.onerror()', `${err.name} - ${err.message}`);
            };

            videoElement.onloadedmetadata = async data => {
              // video now has info about video, maybe duration etc

              console.debug('videoElement.onloadedmetadata()', data);

              try {
                await videoElement.play();

                videoElement.controls = true;
              } catch (err) {
                console.debug('videoElement.play()', `${err.name} - ${err.message}`);
              }
            };

            videoElement.src = source;
          };

          return {
            load,
            unload,
          };
        }

        break;
      case 'mp4':
        console.log('type', 'mp4');

        let mp4Loaded = false;

        return {
          load: noop,
          unload: noop,
        };

        break;
      case 'empty':
        console.log('empty playlist');

        return {
          load: noop,
          unload: noop,
        };

        break;
      default:
        console.log('do not init video');

        return {
          load: noop,
          unload: noop,
        };
    }
  };

  /* const handleIntersect = (data) => {

    console.log('handle intersect', data[0].isIntersecting, videoElement.id);

    $scope.videoIntersecting = data[0].isIntersecting;

    toggleLoadVideo();

  }*/

  /* const handleVisibilityChange = () => {

    console.log('handle visibility change');

    $scope.documentVisible = document.visibilityState === 'visible';

    toggleLoadVideo();

  }*/

  /* const toggleLoadVideo = () => {
     if ($scope.videoIntersecting === true && $scope.documentVisible === true/!*&& $scope.videoLoaded === false*!/) {

       $scope.loadVideo();

       return;
     }

     $scope.unloadVideo();
  }*/

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      loadVideo();
      return;
    }

    try {
      unloadVideo();
    } catch (err) {
      console.warn('unload error', err);
    }

    setVideoPoster(false);
  };

  // function called by ng-init='init(${JSON.stringify(config)})'
  $scope.init = config => {
    $scope.config = config;

    videoElement = document.getElementById(config.videoID);

    // $scope.videoIntersecting = true; // todo check bounds and availability of IntersectionObserver

    // $scope.documentVisible = document.visibilityState === 'visible';

    // $scope.videoLoaded = false;

    /* $scope.observer = new IntersectionObserver(handleIntersect, {
      root: document.querySelector('section.ng-scope') || null,
      rootMargin: '0px',
      threshold: [0.50]
    });*/

    // $scope.observer.observe($scope.video);

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // place msg watch here after waiting for libs?
  };

  $scope.$watch('msg', async (newVal, oldVal) => {
    if (typeof newVal === 'undefined') {
      return;
    }

    unloadVideo();

    setVideoPoster(false);

    // todo switch(msg.topic)...

    try {
      /*
      todo: fix this ugly hack
      - handle lib race condition if hls.js not already cached in browser
      - Hls will initially be undefined when $scope.$watch('msg') is triggered
      - suspected lifecycle of node-red inserting script into head using default values,
      which results in script.async = true
      - condition can be easily illustrated when using private browsing mode
      in firefox and loading ui video player for first time
    */
      await waitForIt(() => typeof Hls === 'function', 10, 1000);

      await waitForIt(() => typeof io === 'function', 10, 1000);

      const { type, source } = extractVideoData(newVal.payload);

      ({ load: loadVideo, unload: unloadVideo } = initVideo(type, source));

      loadVideo();
    } catch (err) {
      console.error(err);

      unloadVideo();

      setVideoPoster(true);
    }
  });

  $scope.$on('$destroy', () => {
    console.log('$scope on destroy');

    document.removeEventListener('visibilitychange', handleVisibilityChange);

    unloadVideo();

    setVideoPoster(false);
  });
};
