import { Page } from '@playwright/test';
import { test as base, expect } from 'playwright-test-coverage';
import { Role, User } from '../src/service/pizzaService';

interface Violation {
  method: string;
  url: string;
  body: string | null;
}

const test = base.extend({
  page: async ({ page }, use) => {
    const violations: Violation[] = [];

    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();

      if (url.startsWith('http://localhost:3000')) {
        const violation = { method: request.method(), url, body: request.postData() };
        violations.push(violation);
        console.log(`Blocked request to http://localhost:3000 -> ${violation.method} ${violation.url} ${violation.body}`);
        await route.abort();
        return;
      }

      await route.continue();
    });

    await use(page);

    expect(violations, 'Unexpected request(s) made to http://localhost:3000').toEqual([]);
  },
});

async function basicInit(page: Page) {
  let loggedInUser: User | undefined;
  type MockFranchise = {
    id: number;
    name: string;
    admins?: { id?: string; name?: string; email: string }[];
    stores: { id: number; name: string; totalRevenue?: number }[];
  };

  const validUsers: Record<string, User> = {
    'd@jwt.com': { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] },
    'a@jwt.com': { id: '4', name: 'Addy admin', email: 'a@jwt.com', password: 'b', roles: [{ role: Role.Admin }] },
    'f@jwt.com': { id: '5', name: 'Franky Franchise', email: 'f@jwt.com', password: 'c', roles: [{ role: Role.Franchisee, objectId: '6' }] },
  };
  // Filler diners so the admin user list spans more than one page (13 users total)
  for (let i = 1; i <= 10; i++) {
    validUsers[`diner${i}@jwt.com`] = { id: String(100 + i), name: `Diner ${i}`, email: `diner${i}@jwt.com`, password: 'x', roles: [{ role: Role.Diner }] };
  }

  const franchises: MockFranchise[] = [
    {
      id: 2,
      name: 'LotaPizza',
      stores: [
        { id: 4, name: 'Lehi' },
        { id: 5, name: 'Springville' },
        { id: 6, name: 'American Fork' },
      ],
    },
    { id: 3, name: 'PizzaCorp', stores: [{ id: 7, name: 'Spanish Fork' }] },
    { id: 4, name: 'topSpot', stores: [] },
    {
      id: 6,
      name: 'FrankyPizza',
      admins: [{ id: '5', name: 'Franky Franchise', email: 'f@jwt.com' }],
      stores: [{ id: 8, name: 'Orem', totalRevenue: 0.05 }],
    },
  ];
    await page.route('*/**/api/auth', async (route) => {
    const method = route.request().method();

    if (method === 'POST') {
      // Register
      const req = route.request().postDataJSON();
      const newUser: User = {
        id: String(Object.keys(validUsers).length + 10),
        name: req.name,
        email: req.email,
        password: req.password,
        roles: [{ role: Role.Diner }],
      };
      validUsers[req.email] = newUser;
      loggedInUser = newUser;
      await route.fulfill({ json: { user: newUser, token: 'abcdef' } });
    } else if (method === 'PUT') {
      // Login
      const loginReq = route.request().postDataJSON();
      const user = validUsers[loginReq.email];
      if (!user || user.password !== loginReq.password) {
        await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
        return;
      }
      loggedInUser = user;
      await route.fulfill({ json: { user, token: 'abcdef' } });
    } else if (method === 'DELETE') {
      // Logout
      loggedInUser = undefined;
      await route.fulfill({ json: { message: 'logout successful' } });
    } else {
      await route.fallback();
    }
  });

  await page.route('*/**/api/user/me', async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: loggedInUser });
  });

  await page.route(/\/api\/user(\/\d+)?(\?.*)?$/, async (route) => {
    const method = route.request().method();
    const url = new URL(route.request().url());
    const idMatch = url.pathname.match(/\/api\/user\/(\d+)$/);

    if (method === 'GET' && !idMatch) {
      // GET /api/user?page=1&limit=10&name=* → paginated user list (pages start at 1)
      const page = Number(url.searchParams.get('page') ?? 1);
      const limit = Number(url.searchParams.get('limit') ?? 10);
      const all = Object.values(validUsers).map(({ password, ...user }) => user);
      const start = (page - 1) * limit;
      await route.fulfill({ json: { users: all.slice(start, start + limit), more: all.length > start + limit } });
    } else if (method === 'PUT' && idMatch) {
      // PUT /api/user/:id → update name and email, and the password only when one is sent
      const req = route.request().postDataJSON();
      const oldEmail = Object.keys(validUsers).find((k) => validUsers[k].id === idMatch[1])!;
      const updated: User = { ...validUsers[oldEmail], name: req.name, email: req.email, password: req.password ?? validUsers[oldEmail].password };
      delete validUsers[oldEmail];
      validUsers[req.email] = updated;
      loggedInUser = updated;
      const { password, ...user } = updated;
      await route.fulfill({ json: { user, token: 'abcdef' } });
    } else if (method === 'DELETE' && idMatch) {
      const email = Object.keys(validUsers).find((k) => validUsers[k].id === idMatch[1]);
      if (email) delete validUsers[email];
      await route.fulfill({ json: { message: 'user deleted' } });
    } else {
      await route.fallback();
    }
  });

  await page.route('*/**/api/order/menu', async (route) => {
    const menuRes = [
      { id: 1, title: 'Veggie', image: 'pizza1.png', price: 0.0038, description: 'A garden of delight' },
      { id: 2, title: 'Pepperoni', image: 'pizza2.png', price: 0.0042, description: 'Spicy treat' },
    ];
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: menuRes });
  });

  await page.route(/\/api\/franchise(\/\d+)?(\?.*)?$/, async (route) => {
    const method = route.request().method();
    const idMatch = route.request().url().match(/franchise\/(\d+)/);

    if (method === 'GET') {
      if (idMatch) {
        // GET /api/franchise/:userId → franchises this user administers
        const userId = idMatch[1];
        const mine = franchises.filter((f) => f.admins?.some((a) => a.id === userId));
        await route.fulfill({ json: mine });
      } else {
        // GET /api/franchise?page=... → admin list
        await route.fulfill({ json: { franchises, more: false } });
      }
    } else if (method === 'POST') {
      const req = route.request().postDataJSON();
      const created: MockFranchise = { id: 5, name: req.name, admins: req.admins, stores: [] };
      franchises.push(created);
      await route.fulfill({ json: created });
    } else if (method === 'DELETE' && idMatch) {
      const i = franchises.findIndex((f) => f.id === Number(idMatch[1]));
      if (i >= 0) franchises.splice(i, 1);
      await route.fulfill({ json: { message: 'franchise deleted' } });
    } else {
      await route.fallback();
    }
  });
  await page.route(/\/api\/franchise\/\d+\/store(\/\d+)?$/, async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    const franchiseId = Number(url.match(/franchise\/(\d+)\/store/)?.[1]);
    const franchise = franchises.find((f) => f.id === franchiseId);

    if (method === 'POST') {
      const req = route.request().postDataJSON();
      const store = { id: 9, name: req.name, totalRevenue: 0 };
      franchise?.stores.push(store);
      await route.fulfill({ json: { id: store.id, franchiseId, name: req.name } });
    } else if (method === 'DELETE') {
      const storeId = Number(url.match(/store\/(\d+)/)?.[1]);
      if (franchise) franchise.stores = franchise.stores.filter((s) => s.id !== storeId);
      await route.fulfill({ json: { message: 'store deleted' } });
    } else {
      await route.fallback();
    }
  });

  await page.route('*/**/api/order', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      // GET /api/order → the logged in diner's order history
      await route.fulfill({ json: { dinerId: loggedInUser?.id, orders: [], page: 1 } });
    } else {
      const orderReq = route.request().postDataJSON();
      const orderRes = {
        order: { ...orderReq, id: 23 },
        jwt: 'eyJpYXQ',
      };
      expect(method).toBe('POST');
      await route.fulfill({ json: orderRes });
    }
  });

  await page.goto('/');
}

async function loginAsAdmin(page: Page) {
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('a@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('b');
  await page.getByRole('button', { name: 'Login' }).click();
}

export { test, expect, basicInit, loginAsAdmin };
