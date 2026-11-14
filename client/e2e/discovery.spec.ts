import { test, expect } from '@playwright/test';

test('public discovery searches the real API, sorts, filters, paginates, and restores URLs', async ({page, request}) => {
  const marker = `discovery${Date.now()}`;
  const account = await request.post('http://127.0.0.1:5001/api/auth/register', {
    data: {username: marker, email: `${marker}@example.com`, password: 'discovery-test-password'},
  });
  expect(account.status()).toBe(201);
  const {token} = await account.json();
  const projects: Array<{id: number; title: string}> = [];
  for (let index = 0; index < 22; index++) {
    const response = await request.post('http://127.0.0.1:5001/api/projects', {
      headers: {Authorization: `Bearer ${token}`},
      data: {
        title: index < 20 ? `${marker} project ${index}` : index === 20 ? 'A description-only match' : 'An unrelated project',
        description: index === 20 ? `${marker} in the description` : 'A creative project',
        is_seeking_collaborators: index % 2 === 0,
      },
    });
    expect(response.status()).toBe(201);
    projects.push((await response.json()).project);
  }

  await page.goto(`/projects?q=${marker}`);
  await expect(page.locator('.project-card')).toHaveCount(20);
  await expect(page.locator('.project-card h2').first()).toHaveText(projects[20].title);
  await expect(page.getByLabel('Sort projects')).toHaveValue('newest');
  await page.getByRole('button', {name: 'Next', exact: true}).click();
  await expect(page.locator('.project-card')).toHaveCount(1);
  await expect(page.locator('.project-card h2').first()).toHaveText(projects[0].title);
  await expect(page.getByRole('button', {name: 'Next', exact: true})).toBeDisabled();

  await page.getByLabel('Sort projects').selectOption('oldest');
  await expect(page.locator('.project-card')).toHaveCount(20);
  await expect(page.locator('.project-card h2').first()).toHaveText(projects[0].title);
  expect(new URL(page.url()).searchParams.get('offset')).toBeNull();
  await page.getByLabel('Seeking collaborators only').check();
  await expect(page.locator('.project-card')).toHaveCount(11);
  for (const card of await page.locator('.project-card').all()) {
    await expect(card.getByText('Seeking Collaborators', {exact: true})).toBeVisible();
  }
  const filteredUrl = page.url();
  await page.reload();
  await expect(page.getByLabel('Search projects')).toHaveValue(marker);
  await expect(page.getByLabel('Sort projects')).toHaveValue('oldest');
  await expect(page.getByLabel('Seeking collaborators only')).toBeChecked();
  await expect(page.locator('.project-card')).toHaveCount(11);
  await expect(page.getByRole('button', {name: 'Next', exact: true})).toBeDisabled();

  await page.locator('.project-card').first().getByRole('link', {name: /View Project/}).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projects[0].id}$`));
  await expect(page.getByRole('heading', {name: projects[0].title, exact: true})).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(filteredUrl);
  await expect(page.locator('.project-card')).toHaveCount(11);

  await page.getByLabel('Search projects').fill(`${marker}-no-match`);
  await page.getByRole('button', {name: 'Search', exact: true}).click();
  await expect(page.getByRole('status')).toHaveText('No projects match your filters.');
  await expect(page.locator('.project-card')).toHaveCount(0);
  await page.getByRole('button', {name: 'Clear filters'}).click();
  await expect(page.getByLabel('Search projects')).toHaveValue('');
  await expect(page.getByLabel('Seeking collaborators only')).not.toBeChecked();
  await expect(page.getByLabel('Sort projects')).toHaveValue('newest');
  await expect(page.locator('.project-card')).toHaveCount(20);
  expect(new URL(page.url()).search).toBe('');
});
