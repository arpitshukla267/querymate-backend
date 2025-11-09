(function() {
  'use strict';
  
  // Get API key from script tag data attribute
  const scriptTag = document.currentScript || document.querySelector('script[data-api-key]');
  const apiKey = scriptTag ? scriptTag.getAttribute('data-api-key') : null;
  let backendUrl = scriptTag ? scriptTag.src.replace('/widget.js', '') : 'https://querymate-backend-sz0d.onrender.com';
  // Ensure backend URL doesn't end with /api
  if (backendUrl.endsWith('/api')) {
    backendUrl = backendUrl.replace('/api', '');
  }
  
  if (!apiKey) {
    console.error('QueryMate Widget: API key is required. Add data-api-key attribute to the script tag.');
    return;
  }

  // Default widget settings
  let widgetSettings = {
    widgetColor: "#667eea",
    logoColor: "#ffffff",
    chatWindowColor: "#ffffff",
    headerColor: "#667eea",
    headerText: "QueryMate",
    poweredByText: "Powered by QueryMate"
  };

  // Fetch widget settings
  async function loadWidgetSettings() {
    try {
      const response = await fetch(`${backendUrl}/api/widget-settings`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        }
      });
      const data = await response.json();
      if (data && data.widgetSettings) {
        widgetSettings = data.widgetSettings;
      }
    } catch (error) {
      console.log('Using default widget settings');
    }
  }

  // Function to create widget HTML with custom settings
  function createWidgetHTML() {
    // Try to extract frontend URL from backend URL
    let frontendUrl = 'https://querymate-frontend.onrender.com';
    if (backendUrl.includes('localhost')) {
      frontendUrl = 'http://localhost:3000';
    } else if (backendUrl.includes('onrender.com')) {
      frontendUrl = backendUrl.replace('backend', 'frontend').replace('-backend', '-frontend');
    }
    return `
    <div id="querymate-widget-container" style="position: fixed; bottom: 20px; right: 20px; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">
      <div id="querymate-widget-button" style="width: 60px; height: 60px; background: ${widgetSettings.widgetColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: transform 0.2s;">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${widgetSettings.logoColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
      <div id="querymate-widget-chat" style="display: none; position: absolute; bottom: 80px; right: 0; width: 380px; max-width: calc(100vw - 40px); height: 600px; max-height: calc(100vh - 100px); background: ${widgetSettings.chatWindowColor}; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); flex-direction: column; overflow: hidden;">
        <div style="background: ${widgetSettings.headerColor}; color: white; padding: 20px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${widgetSettings.headerText}</h3>
              <p style="margin: 4px 0 0 0; font-size: 12px; opacity: 0.9;">How can I help you?</p>
            </div>
            <button id="querymate-close-btn" style="background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 20px; display: flex; align-items: center; justify-content: center;">×</button>
          </div>
          <p style="margin: 0; font-size: 10px; opacity: 0.8; text-align: center;">${widgetSettings.poweredByText}</p>
        </div>
        <div id="querymate-messages" style="flex: 1; overflow-y: auto; padding: 20px; background: ${widgetSettings.chatWindowColor};">
          <div style="margin-bottom: 16px;">
            <div style="background: #e9ecef; padding: 12px; border-radius: 12px; font-size: 14px; color: #495057;">
              Hello! I'm ${widgetSettings.headerText}. How can I help you today?
            </div>
          </div>
        </div>
        <div style="padding: 16px; background: ${widgetSettings.chatWindowColor}; border-top: 1px solid #e9ecef;">
          <div style="display: flex; gap: 8px;">
            <input type="text" id="querymate-input" placeholder="Type your message..." style="flex: 1; padding: 12px; border: 1px solid #dee2e6; border-radius: 24px; font-size: 14px; outline: none;">
            <button id="querymate-send-btn" style="background: ${widgetSettings.widgetColor}; color: white; border: none; padding: 12px 20px; border-radius: 24px; cursor: pointer; font-size: 14px; font-weight: 600;">Send</button>
          </div>
        </div>
      </div>
      <!-- Login Popup -->
      <div id="querymate-login-popup" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10001; align-items: center; justify-content: center;">
        <div style="background: white; border-radius: 16px; padding: 24px; max-width: 400px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.3);">
          <div style="text-align: center; margin-bottom: 20px;">
            <h2 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">Get Your Free Trial! 🎉</h2>
            <p style="margin: 0; color: #666; font-size: 14px;">Please login to get a free trial of our personalized chatbot. Create your own AI assistant tailored to your business!</p>
          </div>
          <div style="display: flex; gap: 12px; flex-direction: column;">
            <a href="${frontendUrl}/login" target="_blank" style="display: block; padding: 12px 24px; background: ${widgetSettings.widgetColor}; color: white; text-align: center; border-radius: 8px; text-decoration: none; font-weight: 600; transition: opacity 0.2s;">Login</a>
            <a href="${frontendUrl}/signup" target="_blank" style="display: block; padding: 12px 24px; background: #f3f4f6; color: #1a1a1a; text-align: center; border-radius: 8px; text-decoration: none; font-weight: 600; transition: opacity 0.2s;">Sign Up</a>
            <button id="querymate-popup-close" style="padding: 8px; background: transparent; border: none; color: #666; cursor: pointer; font-size: 14px;">Maybe Later</button>
          </div>
        </div>
      </div>
    </div>
  `;
  }

  // Initialize widget
  async function initWidget() {
    // Load settings first
    await loadWidgetSettings();
    
    // Inject widget HTML
    const container = document.createElement('div');
    container.innerHTML = createWidgetHTML();
    document.body.appendChild(container);
    
    // Show popup on first visit (check localStorage)
    const popupShown = localStorage.getItem('querymate-popup-shown');
    if (!popupShown) {
      setTimeout(() => {
        const popup = document.getElementById('querymate-login-popup');
        if (popup) {
          popup.style.display = 'flex';
        }
      }, 2000);
    }
  }

  // Start initialization
  initWidget();

  // Wait for DOM to be ready
  function setupWidget() {
    const widgetContainer = document.getElementById('querymate-widget-container');
    const widgetButton = document.getElementById('querymate-widget-button');
    const widgetChat = document.getElementById('querymate-widget-chat');
    const closeBtn = document.getElementById('querymate-close-btn');
    const messagesContainer = document.getElementById('querymate-messages');
    const input = document.getElementById('querymate-input');
    const sendBtn = document.getElementById('querymate-send-btn');
    const popup = document.getElementById('querymate-login-popup');
    const popupClose = document.getElementById('querymate-popup-close');

    if (!widgetContainer || !widgetButton || !widgetChat) {
      setTimeout(setupWidget, 100);
      return;
    }

    let isOpen = false;

    // Toggle widget
    function toggleWidget() {
      isOpen = !isOpen;
      widgetChat.style.display = isOpen ? 'flex' : 'none';
      widgetButton.style.transform = isOpen ? 'scale(0.9)' : 'scale(1)';
    }

    widgetButton.addEventListener('click', toggleWidget);
    if (closeBtn) closeBtn.addEventListener('click', toggleWidget);

    // Close popup
    if (popupClose) {
      popupClose.addEventListener('click', () => {
        if (popup) popup.style.display = 'none';
        localStorage.setItem('querymate-popup-shown', 'true');
      });
    }

    // Close popup when clicking outside
    if (popup) {
      popup.addEventListener('click', (e) => {
        if (e.target === popup) {
          popup.style.display = 'none';
          localStorage.setItem('querymate-popup-shown', 'true');
        }
      });
    }

    // Add message to chat
    function addMessage(text, isUser = false) {
      const messageDiv = document.createElement('div');
      messageDiv.style.marginBottom = '16px';
      messageDiv.style.display = 'flex';
      messageDiv.style.justifyContent = isUser ? 'flex-end' : 'flex-start';
      
      const messageContent = document.createElement('div');
      messageContent.style.background = isUser ? widgetSettings.widgetColor : '#e9ecef';
      messageContent.style.color = isUser ? 'white' : '#495057';
      messageContent.style.padding = '12px 16px';
      messageContent.style.borderRadius = '12px';
      messageContent.style.fontSize = '14px';
      messageContent.style.maxWidth = '80%';
      messageContent.style.wordWrap = 'break-word';
      messageContent.textContent = text;
      
      messageDiv.appendChild(messageContent);
      messagesContainer.appendChild(messageDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Show loading indicator
    function showLoading() {
      const loadingDiv = document.createElement('div');
      loadingDiv.id = 'querymate-loading';
      loadingDiv.style.marginBottom = '16px';
      loadingDiv.style.display = 'flex';
      loadingDiv.style.justifyContent = 'flex-start';
      
      const loadingContent = document.createElement('div');
      loadingContent.style.background = '#e9ecef';
      loadingContent.style.padding = '12px 16px';
      loadingContent.style.borderRadius = '12px';
      loadingContent.style.fontSize = '14px';
      loadingContent.textContent = widgetSettings.headerText + ' is typing...';
      
      loadingDiv.appendChild(loadingContent);
      messagesContainer.appendChild(loadingDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function removeLoading() {
      const loading = document.getElementById('querymate-loading');
      if (loading) loading.remove();
    }

    // Send message
    async function sendMessage() {
      const message = input.value.trim();
      if (!message) return;

      addMessage(message, true);
      input.value = '';
      showLoading();

      try {
        const response = await fetch(`${backendUrl}/api/chat/public`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          body: JSON.stringify({ message })
        });

        const data = await response.json();
        removeLoading();
        
        if (response.ok && data.reply) {
          addMessage(data.reply, false);
        } else {
          addMessage('Sorry, I encountered an error. Please try again.', false);
        }
      } catch (error) {
        removeLoading();
        addMessage('Sorry, I couldn\'t connect to the server. Please try again later.', false);
      }
    }

    if (sendBtn) sendBtn.addEventListener('click', sendMessage);
    if (input) {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
      });
    }

    // Hover effect on button
    widgetButton.addEventListener('mouseenter', () => {
      if (!isOpen) widgetButton.style.transform = 'scale(1.1)';
    });
    widgetButton.addEventListener('mouseleave', () => {
      if (!isOpen) widgetButton.style.transform = 'scale(1)';
    });
  }

  // Setup widget when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupWidget);
  } else {
    setTimeout(setupWidget, 100);
  }
})();

