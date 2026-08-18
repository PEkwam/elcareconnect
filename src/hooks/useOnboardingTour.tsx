import { useEffect, useState } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

const ONBOARDING_COMPLETED_KEY = 'dck_onboarding_completed';

export const useOnboardingTour = () => {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(true);

  useEffect(() => {
    const completed = localStorage.getItem(ONBOARDING_COMPLETED_KEY);
    setHasCompletedOnboarding(completed === 'true');
  }, []);

  const startTour = () => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayColor: 'rgba(0, 0, 0, 0.75)',
      popoverClass: 'driverjs-theme',
      steps: [
        {
          element: '[data-tour="stats-cards"]',
          popover: {
            title: '📊 Dashboard Overview',
            description: 'View key metrics at a glance: total clients, overdue payments, pending calls, and appointments.',
            side: 'bottom',
            align: 'center'
          }
        },
        {
          element: '[data-tour="analytics-tab"]',
          popover: {
            title: '📈 Real-time Analytics',
            description: 'Track call performance, sentiment trends, and agent productivity in real-time.',
            side: 'bottom',
            align: 'start'
          }
        },
        {
          element: '[data-tour="campaigns-tab"]',
          popover: {
            title: '📅 Campaigns',
            description: 'Create and manage call campaigns with AI-powered scripts and scheduling.',
            side: 'bottom',
            align: 'center'
          }
        },
        {
          element: '[data-tour="calls-tab"]',
          popover: {
            title: '📞 Call Management',
            description: 'View call history, manage queues, and track call outcomes.',
            side: 'bottom',
            align: 'center'
          }
        },
        {
          element: '[data-tour="clients-tab"]',
          popover: {
            title: '👥 Client Management',
            description: 'Manage client profiles, policies, and payment statuses.',
            side: 'bottom',
            align: 'end'
          }
        },
        {
          element: '[data-tour="chat-button"]',
          popover: {
            title: '💬 AI Assistant',
            description: 'Get help from our AI assistant for quick policy lookups and guidance.',
            side: 'left',
            align: 'center'
          }
        },
        {
          element: '[data-tour="route-call"]',
          popover: {
            title: '🎯 Smart Call Routing',
            description: 'Automatically route calls to the best available agent based on skills and availability.',
            side: 'bottom',
            align: 'end'
          }
        }
      ],
      onDestroyStarted: () => {
        localStorage.setItem(ONBOARDING_COMPLETED_KEY, 'true');
        setHasCompletedOnboarding(true);
        driverObj.destroy();
      }
    });

    driverObj.drive();
  };

  const resetTour = () => {
    localStorage.removeItem(ONBOARDING_COMPLETED_KEY);
    setHasCompletedOnboarding(false);
  };

  return {
    hasCompletedOnboarding,
    startTour,
    resetTour
  };
};
