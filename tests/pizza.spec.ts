import { test, expect, basicInit, loginAsAdmin } from './testSetup';

test('login', async ({ page }) => {
  await basicInit(page);
  await page.getByRole('link', { name: 'Login' }).click();
  await page.getByRole('textbox', { name: 'Email address' }).fill('d@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('a');
  await page.getByRole('button', { name: 'Login' }).click();

  await expect(page.getByRole('link', { name: 'KC' })).toBeVisible();
});

test('register and log out', async({page})=>{
  await basicInit(page);
  await page.getByRole('link', { name: 'Register' }).click();
  await page.getByRole('textbox', { name: 'Full name' }).fill('New customer');
  await page.getByRole('textbox', { name: 'Email address' }).fill('nc@jwt.com');
  await page.getByRole('textbox', { name: 'Password' }).fill('New');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.getByText('JWT Pizza', { exact: true })).toBeVisible();
 
  await page.getByRole('link', { name: 'Logout' }).click();
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Register' })).toBeVisible();
})

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
  await loginAsAdmin(page);
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
  await expect(page.getByRole('button', { name: 'Close' })).toHaveCount(1);
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

  const provoRow = page.getByRole('row').filter({ hasText: 'Provo Store' });
  await provoRow.getByRole('button', { name: 'Close' }).click();
  await expect(page).toHaveURL(/close-store/);
  // The URL changes before React renders the confirmation page, so wait for its content
  await expect(page.getByRole('main')).toContainText('Are you sure you want to close the FrankyPizza store Provo Store');
  await page.getByRole('button', { name: 'Close' }).click();

  await expect(page.getByRole('cell', { name: 'Orem' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Provo Store' })).not.toBeVisible();
});

test('admin views paginated list of users', async ({ page }) => {
  await basicInit(page);
  await loginAsAdmin(page);

  const firstPageRequest = page.waitForRequest(/\/api\/user\?page=1&limit=10&name=\*$/);
  await page.getByRole('link', { name: 'Admin' }).click();
  await firstPageRequest;

  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  const usersTable = page.getByRole('table', { name: 'Users' });
  await expect(usersTable.locator('tbody tr')).toHaveCount(10);
  await expect(usersTable).toContainText('Kai Chen');
  await expect(usersTable).toContainText('d@jwt.com');
  await expect(usersTable).toContainText('admin');
  await expect(usersTable).toContainText('Diner 7');
  await expect(usersTable).not.toContainText('Diner 8');
  await expect(usersTable.getByRole('button', { name: '«' })).toBeDisabled();

  const secondPageRequest = page.waitForRequest(/\/api\/user\?page=2&limit=10&name=\*$/);
  await usersTable.getByRole('button', { name: '»' }).click();
  await secondPageRequest;

  await expect(usersTable.locator('tbody tr')).toHaveCount(3);
  await expect(usersTable).toContainText('Diner 8');
  await expect(usersTable).toContainText('Diner 10');
  await expect(usersTable).not.toContainText('Kai Chen');
  await expect(usersTable.getByRole('button', { name: '»' })).toBeDisabled();

  await usersTable.getByRole('button', { name: '«' }).click();
  await expect(usersTable).toContainText('Kai Chen');
});

test('admin deletes a user after confirming', async ({ page }) => {
  await basicInit(page);
  await loginAsAdmin(page);
  await page.getByRole('link', { name: 'Admin' }).click();

  const usersTable = page.getByRole('table', { name: 'Users' });
  await usersTable.getByRole('row').filter({ hasText: 'Kai Chen' }).getByRole('button', { name: 'Delete' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Kai Chen');

  const deleteRequest = page.waitForRequest((req) => req.method() === 'DELETE' && /\/api\/user\/3$/.test(req.url()));
  await dialog.getByRole('button', { name: 'Confirm' }).click();
  await deleteRequest;

  await expect(dialog).toBeHidden();
  await expect(usersTable).not.toContainText('Kai Chen');
  // The list is refetched, so the next user moves up onto page 1
  await expect(usersTable).toContainText('Diner 8');
});

test('admin cancels deleting a user', async ({ page }) => {
  await basicInit(page);
  await loginAsAdmin(page);
  await page.getByRole('link', { name: 'Admin' }).click();

  const deleteRequests: string[] = [];
  page.on('request', (req) => {
    if (req.method() === 'DELETE' && req.url().includes('/api/user/')) deleteRequests.push(req.url());
  });

  const usersTable = page.getByRole('table', { name: 'Users' });
  await usersTable.getByRole('row').filter({ hasText: 'Kai Chen' }).getByRole('button', { name: 'Delete' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await expect(dialog).toBeHidden();
  await expect(usersTable).toContainText('Kai Chen');
  expect(deleteRequests).toEqual([]);
});
