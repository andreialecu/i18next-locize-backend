import * as utils from './utils';

// https://gist.github.com/Xeoncross/7663273
function ajax(url, options, callback, data, cache) {
  // Must encode data
  if(data && typeof data === 'object') {
    var y = '', e = encodeURIComponent;
    for (var m in data) {
      y += '&' + e(m) + '=' + e(data[m]);
    }
    data = y.slice(1) + (!cache ? '&_t=' + new Date : '');
  }

  try {
    var x = new (XMLHttpRequest || ActiveXObject)('MSXML2.XMLHTTP.3.0');
    x.open(data ? 'POST' : 'GET', url, 1);
    if (!options.crossDomain) {
      x.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    }
    x.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
    x.onreadystatechange = function() {
      x.readyState > 3 && callback && callback(x.responseText, x);
    };
    x.send(data);
  } catch (e) {
    window.console && console.log(e);
  }
};

// ajax.uriEncode = function(o) {
//     var x, y = '', e = encodeURIComponent;
//     for (x in o) y += '&' + e(x) + '=' + e(o[x]);
//     return y.slice(1);
// };
//
// ajax.collect = (a, f) {
//     var n = [];
//     for (var i = 0; i < a.length; i++) {
//         var v = f(a[i]);
//         if (v != null) n.push(v);
//     }
//     return n;
// };
//
// ajax.serialize = function (f) {
//     function g(n) {
//         return f.getElementsByTagName(n);
//     };
//     var nv = function (e) {
//         if (e.name) return encodeURIComponent(e.name) + '=' + encodeURIComponent(e.value);
//     };
//     var i = collect(g('input'), function (i) {
//         if ((i.type != 'radio' && i.type != 'checkbox') || i.checked) return nv(i);
//     });
//     var s = collect(g('select'), nv);
//     var t = collect(g('textarea'), nv);
//     return i.concat(s).concat(t).join('&');
// };
//

function getDefaults() {
  return {
    loadPath: '/locales/{{lng}}/{{ns}}.json',
    addPath: 'locales/add/{{lng}}/{{ns}}',
    referenceLng: 'en',
    crossDomain: true,
    version: 'latest'
  };
}

class Backend {
  constructor(services, options = {}) {
    this.init(services, options);

    this.type = 'backend';
  }

  init(services, options = {}) {
    this.services = services;
    this.options = {...getDefaults(), ...this.options, ...options};

    this.queuedWrites = {};
    this.debouncedWrite = utils.debounce(this.write, 10000);
  }

  read(language, namespace, callback) {
    let url = this.services.interpolator.interpolate(this.options.loadPath, { lng: language, ns: namespace, projectId: this.options.projectId, version: this.options.version });

    this.loadUrl(url, callback);
  }

  loadUrl(url, callback) {
    ajax(url, this.options, (data, xhr) => {
      const statusCode = xhr.status.toString();
      if (statusCode.indexOf('5') === 0) return callback('failed loading ' + url, true /* retry */);
      if (statusCode.indexOf('4') === 0) return callback('failed loading ' + url, false /* no retry */);

      let ret, err;
      try {
        ret = JSON.parse(data);
      } catch (e) {
        err = 'failed parsing ' + url + ' to json';
      }
      if (err) return callback(err, false);
      callback(null, ret);
    });
  }

  create(languages, namespace, key, fallbackValue, callback) {
    if (!callback) callback = () => {};
    if (typeof languages === 'string') languages = [languages];

    languages.forEach(lng => {
      if (lng === this.options.referenceLng) this.queue.apply(this, arguments);
    });
  }

  write(lng, namespace) {
    let lock = utils.getPath(this.queuedWrites, ['locks', lng, namespace]);
    if (lock) return;

    let url = this.services.interpolator.interpolate(this.options.addPath, { lng: lng, ns: namespace, projectId: this.options.projectId, version: this.options.version });

    let missings = utils.getPath(this.queuedWrites, [lng, namespace]);
    utils.setPath(this.queuedWrites, [lng, namespace], []);

    if (missings.length) {
      // lock
      utils.setPath(this.queuedWrites, ['locks', lng, namespace], true);

      ajax(url, this.options, (data, xhr) => {
        //const statusCode = xhr.status.toString();
        // TODO: if statusCode === 4xx do log

        // unlock
        utils.setPath(this.queuedWrites, ['locks', lng, namespace], false);

        missings.forEach((missing) => {
          if (missing.callback) missing.callback();
        });

        // rerun
        this.debouncedWrite(lng, namespace);
      }, payload);
    }
  }

  queue(lng, namespace, key, fallbackValue, callback) {
    utils.pushPath(this.queuedWrites, [lng, namespace], {key: key, fallbackValue: fallbackValue || '', callback: callback});

    this.debouncedWrite(lng, namespace);
  }
}

Backend.type = 'backend';


export default Backend;
