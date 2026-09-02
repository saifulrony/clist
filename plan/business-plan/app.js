document.addEventListener('DOMContentLoaded', () => {
  // Tab Switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      
      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      const targetContent = document.getElementById(`tab-${target}`);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });

  // Print button
  const printBtn = document.getElementById('printBtn');
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      window.print();
    });
  }

  // Calculator Logic
  const inputEmails = document.getElementById('inputEmails');
  const inputPrice = document.getElementById('inputPrice');
  const inputConv = document.getElementById('inputConv');
  const inputRetention = document.getElementById('inputRetention');

  const valEmails = document.getElementById('valEmails');
  const valPrice = document.getElementById('valPrice');
  const valConv = document.getElementById('valConv');
  const valRetention = document.getElementById('valRetention');

  const resNewClients = document.getElementById('resNewClients');
  const resMRR = document.getElementById('resMRR');
  const resBDT = document.getElementById('resBDT');
  const resARR = document.getElementById('resARR');
  const resValuation = document.getElementById('resValuation');

  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  const calculate = () => {
    const emails = parseInt(inputEmails.value, 10);
    const price = parseInt(inputPrice.value, 10);
    const conv = parseFloat(inputConv.value);
    const retention = parseInt(inputRetention.value, 10);

    valEmails.textContent = formatNumber(emails);
    valPrice.textContent = `$${price}`;
    valConv.textContent = `${conv.toFixed(2)}%`;
    valRetention.textContent = `${retention} months`;

    // Monthly additions
    const newClients = Math.max(1, Math.round(emails * (conv / 100)));
    
    // Steady state active client pool (accounting for natural churn over retention cycle)
    // Roughly 75% of cumulative additions in active window
    const activeSubscribers = Math.round(newClients * (retention * 0.75));
    
    const monthlyMRR = activeSubscribers * price;
    const annualARR = monthlyMRR * 12;
    const bdtMonthly = Math.round(monthlyMRR * 122); // USD to BDT approx
    const valuation = Math.round(annualARR * 4.0); // 4x ARR multiple

    resNewClients.textContent = `${newClients} clients / mo`;
    resMRR.textContent = `$${formatNumber(monthlyMRR)} / mo`;
    resBDT.textContent = `৳ ${formatNumber(bdtMonthly)} BDT`;
    resARR.textContent = `$${formatNumber(annualARR)} / yr`;
    resValuation.textContent = `$${formatNumber(valuation)} USD`;
  };

  [inputEmails, inputPrice, inputConv, inputRetention].forEach((input) => {
    if (input) {
      input.addEventListener('input', calculate);
    }
  });

  // Initial calculate
  calculate();
});
