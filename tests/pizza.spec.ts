import { Page } from '@playwright/test';
import { test, expect } from './testSetup';
import { Role, User } from '../src/service/pizzaService';

async function basicInit(page: Page) {
  let loggedInUser: User | undefined;
  const validUsers: Record<string, User> = { 'd@jwt.com': { id: '3', name: 'Kai Chen', email: 'd@jwt.com', password: 'a', roles: [{ role: Role.Diner }] },
                                             'a@jwt.com':{id: '4', name: 'Addy admin', email: 'a@jwt.com', password: 'b', roles:[{role: Role.Admin}]},
                                            'f@jwt.com':{id: '4', name: 'Franky Franchise', email: 'f@jwt.com', password: 'c', roles:[{role: Role.Franchisee}]} };
  const franchises = [
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
  ];
  await page.route('*/**/api/auth', async (route) => {
    const loginReq = route.request().postDataJSON();
    const user = validUsers[loginReq.email];
    if (!user || user.password !== loginReq.password) {
      await route.fulfill({ status: 401, json: { error: 'Unauthorized' } });
      return;
    }
    loggedInUser = validUsers[loginReq.email];
    const loginRes = {
      user: loggedInUser,
      token: 'abcdef',
    };
    expect(route.request().method()).toBe('PUT');
    await route.fulfill({ json: loginRes });
  });

  await page.route('*/**/api/user/me', async (route) => {
    expect(route.request().method()).toBe('GET');
    await route.fulfill({ json: loggedInUser });
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

    if (method === 'GET') {
      await route.fulfill({ json: { franchises, more: false } });
    } else if (method === 'POST') {
      const req = route.request().postDataJSON();
      const created = { id: 5, name: req.name, admins: req.admins, stores: [] };
      franchises.push(created);
      await route.fulfill({ json: created });
    } else if (method === 'DELETE') {
      const id = Number(route.request().url().match(/franchise\/(\d+)/)?.[1]);
      const i = franchises.findIndex((f) => f.id === id);
      if (i >= 0) franchises.splice(i, 1);
      await route.fulfill({ json: { message: 'franchise deleted' } });
    } else {
      await route.fallback();
    }
  });

  await page.route('*/**/api/order', async (route) => {
    const orderReq = route.request().postDataJSON();
    const orderRes = {
      order: { ...orderReq, id: 23 },
      jwt: 'eyJpYXQ',
    };
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ json: orderRes });
  });

  await page.goto('/');
}

test('login', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
});

test('purchase with login', async ({ page }) => {
  await basicInit(page);

  await page.getByRole('button', { name: 'Order now' }).click();

  await expect(page.locator('h2')).toContainText('Awesome is a click away');
  await page.getByRole('combobox').selectOption('4');
  await page.getByRole('link', { name: 'Image Description Veggie A' }).click();
  await page.getByRole('link', { name: 'Image Description Pepperoni' }).click();
  await expect(page.locator('form')).toContainText('Selected pizzas: 2');
  await page.getByRole('button', { name: 'Checkout' }).click();

  await page.getByPlaceholder('Email address').fill('d@jwt.com');
  await page.getByPlaceholder('Password').fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('main')).toContainText('Send me those 2 pizzas right now!');
  await expect(page.locator('tbody')).toContainText('Veggie');
  await expect(page.locator('tbody')).toContainText('Pepperoni');
  await expect(page.locator('tfoot')).toContainText('0.008 ₿');
  await page.getByRole('button', { name: 'Pay now' }).click();

  await expect(page.getByText('0.008')).toBeVisible();
});

test('Add and remove franchisee as admin', async({page}) =>{
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('a@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('b');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('link', { name: 'Admin' }).click();
  await page.getByRole('button', { name: 'Add Franchise' }).click();
  await page.getByRole('textbox', { name: 'franchise name' }).click();
  await page.getByRole('textbox', { name: 'franchise name' }).fill('HotPizza');
  await page.getByRole('textbox', { name: 'franchisee admin email' }).click();
  await page.getByRole('textbox', { name: 'franchisee admin email' }).fill('d@jwt.com');
  await page.getByRole('button', { name: 'Create' }).click();
  
  const hotPizzaRow = page.getByRole('row').filter({ hasText: 'HotPizza' });
  await expect(hotPizzaRow).toBeVisible();
  await hotPizzaRow.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/close-franchise/);
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByRole('link', { name: 'admin-dashboard' })).toBeVisible();
  
  await expect(page.getByRole('heading', { name: 'Franchises' })).toBeVisible();


});

test("add and remove store as franchisee", async({page})=>{
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('f@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('c');
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByRole('navigation', { name: 'Global' }).getByRole('link', { name: 'Franchise' }).click();
  await expect(page.getByRole('link', { name: 'franchise-dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Create store' }).click();
  await page.getByRole('textbox', { name: 'store name' }).fill('Provo Store');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('cell', { name: 'Provo Store' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Close' }).click();
})