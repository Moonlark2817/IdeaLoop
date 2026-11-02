import { test, expect } from '@playwright/test';
test('complete authenticated project and threaded comment lifecycle', async ({page, browser}) => {
 const suffix = Date.now().toString(); const email = `alice${suffix}@example.com`; const password = 'browser-test-password';
 await page.goto('/projects/new'); await expect(page.getByRole('heading',{name:'Sign in'})).toBeVisible();
 await page.getByRole('link',{name:'Create an account',exact:true}).click();
 await page.getByLabel('Username').fill(`alice${suffix}`); await page.getByLabel('Email',{exact:true}).fill(email); await page.getByLabel('Password',{exact:true}).fill(password); await page.getByRole('button',{name:'Register',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Create a Project'})).toBeVisible();
 await page.getByLabel('Project Title *',{exact:true}).fill('Browser project'); await page.getByLabel('Description *',{exact:true}).fill('A real API project'); await page.getByRole('button',{name:'Create Project',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Browser project'})).toBeVisible(); const projectUrl = page.url();

// Check that a project saved through the API appears in the community feed.
await page.goto('/projects');

// Make sure the newly created project appears.
const projectCard = page.locator('.project-card').filter({
  has: page.getByRole('heading', { name: 'Browser project' })
});

await expect(projectCard).toBeVisible();

// Open the project from the community feed.
await projectCard.getByRole('link', { name: /View Project/ }).click();

// Verify that the correct project details page opens.
await expect(page).toHaveURL(projectUrl);
await expect(
  page.getByRole('heading', { name: 'Browser project' })
).toBeVisible();

 await page.getByRole('link',{name:'Edit Project',exact:true}).click(); await page.getByLabel('Project Title *',{exact:true}).fill('Updated project'); await page.getByRole('button',{name:'Save Changes'}).click(); await expect(page.getByRole('heading',{name:'Updated project'})).toBeVisible();
 await page.getByLabel('Your comment',{exact:true}).fill('Root comment'); await page.getByRole('button',{name:'Save comment',exact:true}).click(); await expect(page.getByText('Root comment',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Edit comment',exact:true}).click(); await page.getByLabel('Edit comment',{exact:true}).fill('Edited root'); await page.getByRole('button',{name:'Save comment',exact:true}).first().click(); await expect(page.getByText('Edited root',{exact:true})).toBeVisible();
 const other = await browser.newContext(); const guest = await other.newPage(); await guest.goto(projectUrl); await expect(guest.getByRole('link',{name:'Edit Project',exact:true})).toHaveCount(0); await expect(guest.getByRole('button',{name:'Edit comment',exact:true})).toHaveCount(0);
 await guest.getByRole('link',{name:'Sign in to comment'}).click(); await guest.getByRole('link',{name:'Create an account',exact:true}).click(); await guest.getByLabel('Username').fill(`bob${suffix}`); await guest.getByLabel('Email',{exact:true}).fill(`bob${suffix}@example.com`); await guest.getByLabel('Password',{exact:true}).fill(password); await guest.getByRole('button',{name:'Register',exact:true}).click();
 await guest.getByRole('button',{name:'Reply',exact:true}).click(); await guest.getByLabel('Your reply').fill('Other user reply'); await guest.getByRole('button',{name:'Save comment',exact:true}).first().click(); await expect(guest.getByText('Other user reply',{exact:true})).toBeVisible();
 await guest.goto(`${projectUrl}/edit`); await expect(guest.getByRole('alert')).toContainText('only edit your own');
 await page.reload(); await expect(page.getByText('Other user reply',{exact:true})).toBeVisible();
 page.once('dialog',dialog => dialog.dismiss()); await page.getByRole('button',{name:'Delete comment',exact:true}).click(); await expect(page.getByText('Edited root',{exact:true})).toBeVisible();
 page.once('dialog',async dialog => {expect(dialog.message()).toContain('other users'); await dialog.accept();}); await page.getByRole('button',{name:'Delete comment',exact:true}).click(); await expect(page.getByText('Edited root',{exact:true})).toHaveCount(0); await expect(page.getByText('Other user reply',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Sign out',exact:true}).click(); await page.getByRole('link',{name:'Sign in',exact:true}).click(); await page.getByLabel('Email',{exact:true}).fill(email); await page.getByLabel('Password',{exact:true}).fill(password); await page.getByRole('button',{name:'Sign in',exact:true}).click(); await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
 await page.goto(projectUrl); page.once('dialog',dialog => dialog.accept()); await page.getByRole('button',{name:'Delete Project',exact:true}).click(); await expect(page).toHaveURL(/\/projects$/);
 await page.evaluate(() => sessionStorage.setItem('idealoop_token','expired-token')); await page.goto('/projects/new'); await expect(page.getByRole('heading',{name:'Sign in'})).toBeVisible(); await expect.poll(() => page.evaluate(() => sessionStorage.getItem('idealoop_token'))).toBeNull(); await other.close();
});
test('mobile navigation, direct links, keyboard access, and unavailable API',async ({page}) => {
 await page.setViewportSize({width:375,height:812}); await page.goto('/projects'); await page.keyboard.press('Tab'); await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused(); await expect(page.getByRole('heading',{name:'Community projects'})).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.goto('/missing-page'); await expect(page.getByRole('heading',{name:'Page not found'})).toBeVisible();
 await page.route('**/api/projects?*',route => route.fulfill({status:503,contentType:'application/json',body:'{"error":{"message":"Service unavailable"}}'})); await page.goto('/projects'); await expect(page.getByRole('alert')).toContainText('Service unavailable');
});
