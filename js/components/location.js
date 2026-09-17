// js/components/location.js

export function initLocation() {
  const globalLocationBtns = document.querySelectorAll('.global-location-btn');
  const locationModal = document.getElementById('location-modal');
  const btnClose = locationModal?.querySelectorAll('.modal-close, .modal-close-btn');
  const btnUseCurrent = document.getElementById('btn-use-current-location');
  const btnSaveManual = document.getElementById('btn-save-location');
  const manualInput = document.getElementById('manual-location-input');
  
  // Update UI with saved location on load
  const savedLocation = localStorage.getItem('user-location') || 'Set Location';
  updateLocationUI(savedLocation);

  if (!locationModal) return;

  // Open modal
  globalLocationBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openModal();
    });
  });

  // Close modal
  if (btnClose) {
    btnClose.forEach(btn => {
      btn.addEventListener('click', closeModal);
    });
  }

  // Close on outside click
  locationModal.addEventListener('click', (e) => {
    if (e.target === locationModal) {
      closeModal();
    }
  });

  // Use Current Location
  if (btnUseCurrent) {
    btnUseCurrent.addEventListener('click', async () => {
      btnUseCurrent.innerHTML = '<i data-lucide="loader" class="animate-spin" style="margin-right: 8px;"></i> Locating...';
      if (window.lucide) window.lucide.createIcons();
      
      if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser.');
        resetCurrentBtn();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            // Reverse geocoding using Nominatim (OpenStreetMap)
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const data = await response.json();
            
            // Extract best city representation
            const city = data.address.city || data.address.town || data.address.village || data.address.county || 'Unknown Location';
            const state = data.address.state || '';
            
            const locationString = state ? `${city}, ${state}` : city;
            
            saveLocation(locationString);
            closeModal();
            resetCurrentBtn();
          } catch (error) {
            console.error('Error fetching location data:', error);
            alert('Failed to get location name. Please enter manually.');
            resetCurrentBtn();
          }
        },
        (error) => {
          console.error('Geolocation error:', error);
          alert('Unable to retrieve your location. Please check permissions or enter manually.');
          resetCurrentBtn();
        }
      );
    });
  }

  // Save manual location
  if (btnSaveManual && manualInput) {
    btnSaveManual.addEventListener('click', () => {
      const val = manualInput.value.trim();
      if (val) {
        saveLocation(val);
        closeModal();
        manualInput.value = '';
      }
    });

    manualInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        btnSaveManual.click();
      }
    });
  }

  function openModal() {
    locationModal.classList.remove('hidden');
    // small delay for css animation
    setTimeout(() => {
      locationModal.classList.add('visible');
    }, 10);
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    locationModal.classList.remove('visible');
    setTimeout(() => {
      locationModal.classList.add('hidden');
    }, 300); // match css transition
    document.body.style.overflow = '';
  }

  function saveLocation(location) {
    localStorage.setItem('user-location', location);
    updateLocationUI(location);
  }

  function updateLocationUI(location) {
    const textElements = document.querySelectorAll('.global-location-btn .location-text');
    textElements.forEach(el => {
      el.textContent = location;
    });
  }

  function resetCurrentBtn() {
    if (btnUseCurrent) {
      btnUseCurrent.innerHTML = '<i data-lucide="crosshair"></i> Use My Current Location';
      if (window.lucide) window.lucide.createIcons();
    }
  }
}
