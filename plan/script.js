document.addEventListener('DOMContentLoaded', () => {
  // Billing Toggle
  const toggle = document.getElementById('billingToggle');
  const labels = document.querySelectorAll('.toggle-label');
  const amounts = document.querySelectorAll('.amount[data-monthly]');
  let isYearly = false;

  toggle.addEventListener('click', () => {
    isYearly = !isYearly;
    toggle.classList.toggle('active', isYearly);
    
    labels.forEach(label => {
      const period = label.dataset.period;
      label.classList.toggle('active', 
        (period === 'yearly' && isYearly) || 
        (period === 'monthly' && !isYearly)
      );
    });

    amounts.forEach(el => {
      const monthly = el.dataset.monthly;
      const yearly = el.dataset.yearly;
      el.textContent = isYearly ? yearly : monthly;
    });
  });

  labels.forEach(label => {
    label.addEventListener('click', () => {
      const period = label.dataset.period;
      if ((period === 'yearly' && !isYearly) || (period === 'monthly' && isYearly)) {
        toggle.click();
      }
    });
  });

  // FAQ Accordion
  const faqItems = document.querySelectorAll('.faq-item');
  
  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');
    
    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');
      
      faqItems.forEach(i => i.classList.remove('active'));
      
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Animate on scroll
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  document.querySelectorAll('.why-card, .pricing-card').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'all 0.5s ease';
    observer.observe(el);
  });
});
