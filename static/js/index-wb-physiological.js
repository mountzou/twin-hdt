(() => {
  const DEVICE_ID = "eui-0080e1150510b546";
  document.getElementById("wearable-device-id").textContent = DEVICE_ID;

  const getDecoded = (i) => i?.data?.uplink_message?.decoded_payload || {};
  const getHub = (i) => getDecoded(i)?.sensorhub || {};

  const getHR       = (i) => getHub(i)?.heartRate_bpm ?? null;
  const getHRConf   = (i) => getHub(i)?.hrConfidence_percent ?? null;
  const getSpO2     = (i) => getHub(i)?.spo2_percent ?? null;
  const getSpO2Conf = (i) => getHub(i)?.spo2Confidence_percent ?? null;
  const getSpO2Low  = (i) => !!getHub(i)?.spo2LowSignalQuality;
  const getEnergy   = (i) => getHub(i)?.totalEnergyExp_kcal ?? null;
  const getSteps    = (i) => getHub(i)?.totalWalkSteps ?? null;

  const fmtTime = (tsSec) => {
    if (!tsSec) return "–";
    const d = new Date(tsSec * 1000);
    return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const confBadge = (pct) => {
    if (!Number.isFinite(pct)) return "conf-neutral";
    if (pct >= 80)   return "conf-high";
    if (pct >= 50)   return "conf-medium";
    return "conf-low";
  };

  // --- animation helper ---
  function bump(el) {
    el.classList.remove('value-bump');
    void el.offsetWidth; // reflow
    el.classList.add('value-bump');
  }

  // --- DOM refs ---
  const elAlert = document.getElementById("wearable-alert");
  const elCards = document.getElementById("wearable-cards");
  const elFoot  = document.getElementById("wearable-footnote");

  const elHRVal  = document.getElementById("hr-value");
  const elHRTime = document.getElementById("hr-time");
  const elHRConf = document.getElementById("hr-conf");

  const elSpVal  = document.getElementById("spo2-value");
  const elSpTime = document.getElementById("spo2-time");
  const elSpConf = document.getElementById("spo2-conf");
  const elSpWarn = document.getElementById("spo2-warning");

  const elEnVal  = document.getElementById("energy-value");
  const elEnTime = document.getElementById("energy-time");
  const elStVal  = document.getElementById("steps-value");
  const elStTime = document.getElementById("steps-time");

  // --- show cards on first update ---
  let firstUpdateDone = false;
  const showCards = () => {
    if (firstUpdateDone) return;
    firstUpdateDone = true;
    elAlert.classList.remove('d-flex', 'd-inline-flex');
    elAlert.classList.add('d-none');
    elAlert.style.display = 'none';
    setTimeout(() => { if (elAlert?.parentNode) elAlert.parentNode.removeChild(elAlert); }, 0);
    elCards.classList.remove('d-none');
    elFoot.style.removeProperty('display');
  };

  // --- Socket.IO handling ---
  const socket = window.socket || io({ transports: ["websocket", "polling"] });
  window.socket = socket;

  socket.on("test_wearable_up", (item) => {
    showCards();
    const ts = item?.ts ?? null;

    const hr  = getHR(item);
    const hrc = getHRConf(item);
    if (hr != null || hrc != null) {
      elHRVal.textContent = Math.round(hr);
      bump(elHRVal);
      elHRConf.className = `badge conf-badge ${confBadge(hrc)}`;
      elHRConf.innerHTML = Number.isFinite(hrc) ? `${Math.round(hrc)}%<sup>*</sup>` : "–";
      elHRTime.textContent = fmtTime(ts);
    }

    const sp   = getSpO2(item);
    const spc  = getSpO2Conf(item);
    const slow = getSpO2Low(item);
    if (sp != null || spc != null) {
      elSpVal.textContent = Number(sp).toFixed(1).replace(/\.0$/, '');
      bump(elSpVal);
      elSpConf.className = `badge conf-badge ${confBadge(spc)}`;
      elSpConf.innerHTML = Number.isFinite(spc) ? `${Math.round(spc)}%<sup>*</sup>` : "–";
      elSpTime.textContent = fmtTime(ts);
      elSpWarn.classList.toggle("d-none", !slow);
    }

    const en = getEnergy(item);
    if (en != null) {
      elEnVal.textContent = Number(en).toFixed(1).replace(/\.0$/, '');
      bump(elEnVal);
      elEnTime.textContent = fmtTime(ts);
    }

    const st = getSteps(item);
    if (st != null) {
      elStVal.textContent = Number(st).toLocaleString();
      bump(elStVal);
      elStTime.textContent = fmtTime(ts);
    }
  });
})();