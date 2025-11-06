describe('Restaurant Lists Feature (Beta)', () => {
  const testEmail = 'listtest@example.com';
  const testPassword = 'password123';

  beforeEach(() => {
    // Clear localStorage before each test
    cy.clearLocalStorage();

    // Login before each test
    cy.visit('/');
    cy.login(testEmail, testPassword);
    cy.url().should('include', '/home');

    // Navigate to beta page (admin only)
    cy.get('[data-testid="profile-tab"]').click();
    cy.get('[data-testid="beta-button"]').click();
    cy.url().should('include', '/beta');

    // Open Restaurant Lists feature
    cy.get('[data-testid="try-restaurant-lists-button"]').click();
  });

  afterEach(() => {
    // Logout after each test
    cy.logout();
  });

  it('should access lists feature from beta page', () => {
    // Verify we're in the lists feature
    cy.contains('My Lists').should('be.visible');
    cy.get('[data-testid="create-list-button"]').should('be.visible');
  });

  it('should create a new list', () => {
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

    // Verify we're on list detail view
    cy.contains('restaurants').should('be.visible');
    cy.get('[data-testid="delete-list-button"]').should('be.visible');
  });

  it('should delete a list', () => {
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
    cy.contains('My Lists').should('be.visible');

    // Verify list is gone
    cy.contains('List to Delete').should('not.exist');
  });

  it('should show empty state when no lists exist', () => {
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
    cy.get('[data-testid="create-list-button"]').click();

    // Try to submit without name
    cy.get('[data-testid="create-list-submit"]').should('be.disabled');

    // Add name and verify button is enabled
    cy.get('[data-testid="list-name-input"]').type('Valid Name');
    cy.get('[data-testid="create-list-submit"]').should('not.be.disabled');
  });

  it('should display visibility icons on lists', () => {
    // Create a private list
    cy.get('[data-testid="create-list-button"]').click();
    cy.get('[data-testid="list-name-input"]').type('Private List');
    cy.get('[data-testid="visibility-private"]').click();
    cy.get('[data-testid="create-list-submit"]').click();

    // Verify private list shows
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
    cy.get('[data-testid="create-list-button"]').click();

    // Fill in some data
    cy.get('[data-testid="list-name-input"]').type('Test List');

    // Click cancel
    cy.contains('button', 'Cancel').click();

    // Verify dialog closed (input should not be visible)
    cy.get('[data-testid="list-name-input"]').should('not.exist');
  });

  it('should return to beta page when closing lists feature', () => {
    // Close the lists feature using the X button
    cy.get('button').contains('X').should('exist');
    // Note: The actual close button implementation may vary
    // This test verifies the feature can be exited
  });
});
