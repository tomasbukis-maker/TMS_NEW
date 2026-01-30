import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import DashboardPage from '../pages/DashboardPage';

// Mock the API
jest.mock('../services/api', () => ({
  get: jest.fn(),
}));

// Mock useNavigate
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock useModule hook
jest.mock('../context/ModuleContext', () => ({
  useModule: () => ({
    activeModule: null,
    setActiveModule: jest.fn(),
  }),
}));

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders loading state initially', () => {
    render(<DashboardPage />);

    expect(screen.getByText('Kraunama...')).toBeInTheDocument();
  });

  test('renders dashboard title', async () => {
    const mockApi = require('../services/api');
    mockApi.get.mockResolvedValueOnce({
      data: {
        orders: { finished: 5, unfinished: 3, new: 2 },
        invoices: {
          paid_sales: { count: 10, total: '5000.00' },
          unpaid_sales: { count: 3, total: '1500.00' },
          overdue_sales: { count: 1 },
          paid_purchase: { count: 8, total: '3000.00' },
          unpaid_purchase: { count: 2, total: '800.00' },
          overdue_purchase: { count: 0 },
        },
        clients: { new_this_month: 3 },
        alerts: [],
      },
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('📋 Užsakymai')).toBeInTheDocument();
    });

    expect(screen.getByText('💰 Finansai')).toBeInTheDocument();
    expect(screen.getByText('📄 Sąskaitos')).toBeInTheDocument();
    expect(screen.getByText('👥 Klientai')).toBeInTheDocument();
  });

  test('displays order statistics correctly', async () => {
    const mockApi = require('../services/api');
    mockApi.get.mockResolvedValueOnce({
      data: {
        orders: { finished: 5, unfinished: 3, new: 2 },
        invoices: {
          paid_sales: { count: 10, total: '5000.00' },
          unpaid_sales: { count: 3, total: '1500.00' },
          overdue_sales: { count: 1 },
          paid_purchase: { count: 8, total: '3000.00' },
          unpaid_purchase: { count: 2, total: '800.00' },
          overdue_purchase: { count: 0 },
        },
        clients: { new_this_month: 3 },
        alerts: [],
      },
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument(); // Finished orders
      expect(screen.getByText('3')).toBeInTheDocument(); // Unfinished orders
      expect(screen.getByText('2')).toBeInTheDocument(); // New orders
    });
  });

  test('displays invoice statistics correctly', async () => {
    const mockApi = require('../services/api');
    mockApi.get.mockResolvedValueOnce({
      data: {
        orders: { finished: 0, unfinished: 0, new: 0 },
        invoices: {
          paid_sales: { count: 10, total: '5000.00' },
          unpaid_sales: { count: 3, total: '1500.00' },
          overdue_sales: { count: 1 },
          paid_purchase: { count: 8, total: '3000.00' },
          unpaid_purchase: { count: 2, total: '800.00' },
          overdue_purchase: { count: 0 },
        },
        clients: { new_this_month: 3 },
        alerts: [],
      },
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument(); // Paid sales invoices
      expect(screen.getByText('3')).toBeInTheDocument(); // Unpaid sales invoices
      expect(screen.getByText('1')).toBeInTheDocument(); // Overdue sales
    });
  });

  test('displays error message on API failure', async () => {
    const mockApi = require('../services/api');
    mockApi.get.mockRejectedValueOnce(new Error('API Error'));

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText(/Klaida užkraunant statistiką/)).toBeInTheDocument();
    });
  });

  test('renders alerts when present', async () => {
    const mockApi = require('../services/api');
    mockApi.get.mockResolvedValueOnce({
      data: {
        orders: { finished: 0, unfinished: 0, new: 0 },
        invoices: {
          paid_sales: { count: 0, total: '0.00' },
          unpaid_sales: { count: 0, total: '0.00' },
          overdue_sales: { count: 0 },
          paid_purchase: { count: 0, total: '0.00' },
          unpaid_purchase: { count: 0, total: '0.00' },
          overdue_purchase: { count: 0 },
        },
        clients: { new_this_month: 0 },
        alerts: [
          {
            type: 'warning',
            message: 'Test alert message',
            link: '/test-link',
          },
        ],
      },
    });

    render(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByText('⚠️ Skubūs pranešimai')).toBeInTheDocument();
      expect(screen.getByText('Test alert message')).toBeInTheDocument();
    });
  });
});
