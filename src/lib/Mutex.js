const Mutex = {
  mutexes: {},
  lock: {},
  cleanup: null,

  getMutex: function (objkey) {
    if (this.mutexes[objkey]) return this.mutexes[objkey];
    else {
      this.mutexes[objkey] = [];
      return this.mutexes[objkey];
    }
  },
  putObject: function (objkey, obj) {
    this.getMutex(objkey).push(obj);
  },
  process: async function (mykey, func) {
    let that = this;
    //如果不存在myKey的lock，就执行
    if (!that.lock[mykey]) {
      that.lock[mykey] = new Date().getTime();
      let objArr = that.mutexes[mykey];
      //取得对象的序列，拿出第一个进行处理
      let oneObj = objArr.shift();
      if (oneObj) {
        try {
          await func(oneObj);
        } catch (err) {
          console.error(err);
        }
      }
      delete that.lock[mykey];
    } else {
      //否则，100毫秒后再尝试
      setTimeout(async () => {
        await that.process(mykey, func);
      }, 100);
    }

    if (that.cleanup !== null) {
      clearTimeout(that.cleanup);
    }
    that.cleanup = setTimeout(async () => {
      for (const [myKey, lockTime] in Object.entries(that.lock)) {
        if (lockTime < new Date().getTime() - 600000) {
          // 10 minutes
          delete that.lock[myKey];
        }
      }
      that.cleanup = null;
    }, 1000);
  },
};

module.exports = { Mutex };
