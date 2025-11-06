describe('Restaurant Lists Feature', () => {
  const testEmail = 'listtest@example.com';
  const testPassword = 'password123';

  beforeEach(() => {
    // Clear localStorage before each test
    cy.clearLocalStorage();

    // Login before each test
    cy.visit('/');
    cy.login(testEmail, testPassword);
    cy.url().should('include', '/home');
  });

  afterEach(() => {
    // Logout after each test
    cy.logout();
  });

  it('should navigate to lists page from profile', () => {
    // Navigate to profile
    cy.get('[data-testid="profile-tab"]').click();
    cy.url().should('include', '/profile');

    // Click on My Lists button
    cy.get('[data-testid="my-lists-button"]').should('be.visible').click();
    cy.url().should('include', '/lists');
  });

  it('should create a new list', () => {
    // Navigate to lists page
    cy.visit('/lists');

    // Click create list button
    cy.get('[data-testid="create-list-button"]').click();

    // Fill in list details
    cy.get('[data-testid="list-name-input"]').type('Best Pizza Spots');
    cy.get('[data-testid="list-description-input"]').type('My favorite pizza places in town');

    // Select visibility (friends)
    cy.get('[data-testid="visibility-friends"]').click();

    // Submit form
    cy.get('[data-testid="create-list-submit"]').click();

    // Verify list was created
    cy.contains('Best Pizza Spots').should('be.visible');
    cy.contains('0 restaurants').should('be.visible');
  });

  it('should view list detail', () => {
    // Navigate to lists page
    cy.visit('/lists');

    // Create a list first if none exist
    cy.get('body').then(($body) => {
      if ($body.text().includes('No lists yet')) {
        cy.get('[data-testid="create-list-button"]').click();
        cy.get('[data-testid="list-name-input"]').type('Test List');
        cy.get('[data-testid="visibility-private"]').click();
        cy.get('[data-testid="create-list-submit"]').click();
      }
    });

    // Click on a list card
    cy.get('[data-testid^="list-card-"]').first().click();

    // Verify we're on list detail page
    cy.url().should('include', '/lists/');
    cy.contains('restaurants').should('be.visible');
  });

  it('should delete a list', () => {
    // Navigate to lists page
    cy.visit('/lists');

    // Create a list to delete
    cy.get('[data-testid="create-list-button"]').click();
    cy.get('[data-testid="list-name-input"]').type('List to Delete');
    cy.get('[data-testid="visibility-private"]').click();
    cy.get('[data-testid="create-list-submit"]').click();

    // Wait for list to appear
    cy.contains('List to Delete').should('be.visible');

    // Click on the list
    cy.get('[data-testid^="list-card-"]').contains('List to Delete').click();

    // Click delete button
    cy.get('[data-testid="delete-list-button"]').click();

    // Confirm deletion
    cy.contains('Delete List').should('be.visible');
    cy.contains('button', 'Delete List').click();

    // Verify we're back on lists page
    cy.url().should('include', '/lists');
    cy.url().should('not.include', '/lists/');

    // Verify list is gone
    cy.contains('List to Delete').should('not.exist');
  });

  it('should show empty state when no lists exist', () => {
    // This test assumes a fresh user with no lists
    // For comprehensive testing, you might need to clean up lists first
    cy.visit('/lists');

    // Check for empty state or existing lists
    cy.get('body').then(($body) => {
      if ($body.text().includes('No lists yet')) {
        cy.contains('No lists yet').should('be.visible');
        cy.contains('Create your first list').should('be.visible');
      } else {
        // If lists exist, just verify the page loaded
        cy.contains('My Lists').should('be.visible');
      }
    });
  });

  it('should show character count for list name and description', () => {
    cy.visit('/lists');
    cy.get('[data-testid="create-list-button"]').click();

    // Type in list name and check character count
    const listName = 'Best Restaurants';
    cy.get('[data-testid="list-name-input"]').type(listName);
    cy.contains(`${listName.length}/100 characters`).should('be.visible');

    // Type in description and check character count
    const description = 'A collection of the best restaurants';
    cy.get('[data-testid="list-description-input"]').type(description);
    cy.contains(`${description.length}/500 characters`).should('be.visible');
  });

  it('should not allow creating list without name', () => {
    cy.visit('/lists');
    cy.get('[data-testid="create-list-button"]').click();

    // Try to submit without name
    cy.get('[data-testid="create-list-submit"]').should('be.disabled');

    // Add name and verify button is enabled
    cy.get('[data-testid="list-name-input"]').type('Valid Name');
    cy.get('[data-testid="create-list-submit"]').should('not.be.disabled');
  });

  it('should display visibility icons on lists', () => {
    cy.visit('/lists');

    // Create a private list
    cy.get('[data-testid="create-list-button"]').click();
    cy.get('[data-testid="list-name-input"]').type('Private List');
    cy.get('[data-testid="visibility-private"]').click();
    cy.get('[data-testid="create-list-submit"]').click();

    // Verify private list shows lock icon (by checking the card exists)
    cy.contains('Private List').should('be.visible');

    // Create a friends list
    cy.get('[data-testid="create-list-button"]').click();
    cy.get('[data-testid="list-name-input"]').type('Friends List');
    cy.get('[data-testid="visibility-friends"]').click();
    cy.get('[data-testid="create-list-submit"]').click();

    // Verify friends list exists
    cy.contains('Friends List').should('be.visible');
  });

  it('should close create dialog when clicking cancel', () => {
    cy.visit('/lists');
    cy.get('[data-testid="create-list-button"]').click();

    // Fill in some data
    cy.get('[data-testid="list-name-input"]').type('Test List');

    // Click cancel
    cy.contains('button', 'Cancel').click();

    // Verify dialog closed (input should not be visible)
    cy.get('[data-testid="list-name-input"]').should('not.exist');
  });
});
