describe('Notes Feature', () => {
  const testEmail = 'notetest@example.com';
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

  describe('Log Note Flow', () => {
    it('should access log note from add visit menu', () => {
      // Navigate to add visit page
      cy.get('[data-testid="add-visit-button"]').click();
      cy.url().should('include', '/add-visit');

      // Click on Log Note option
      cy.get('[data-testid="add-option-log-note"]').click();
      cy.url().should('include', '/log-note');

      // Verify we're on the log note page
      cy.contains('Log Note').should('be.visible');
      cy.get('[data-testid="note-content-input"]').should('be.visible');
    });

    it('should create a note with content only', () => {
      // Navigate to log note page
      cy.get('[data-testid="add-visit-button"]').click();
      cy.get('[data-testid="add-option-log-note"]').click();

      // Enter note content
      const noteContent = 'Great sushi at the new place downtown';
      cy.get('[data-testid="note-content-input"]').type(noteContent);

      // Save note
      cy.get('[data-testid="save-note-button"]').click();

      // Should redirect to home
      cy.url().should('include', '/home');
    });

    it('should create a note with location', () => {
      // Navigate to log note page
      cy.get('[data-testid="add-visit-button"]').click();
      cy.get('[data-testid="add-option-log-note"]').click();

      // Enter note content
      cy.get('[data-testid="note-content-input"]').type('Amazing ramen for lunch');

      // Enter location
      cy.get('[data-testid="note-location-input"]').type('Ramen Shop on 5th Ave');

      // Save note
      cy.get('[data-testid="save-note-button"]').click();

      // Should redirect to home
      cy.url().should('include', '/home');
    });

    it('should not allow saving note without content', () => {
      // Navigate to log note page
      cy.get('[data-testid="add-visit-button"]').click();
      cy.get('[data-testid="add-option-log-note"]').click();

      // Save button should be disabled when content is empty
      cy.get('[data-testid="save-note-button"]').should('be.disabled');

      // Enter content
      cy.get('[data-testid="note-content-input"]').type('Some content');

      // Now button should be enabled
      cy.get('[data-testid="save-note-button"]').should('not.be.disabled');
    });

    it('should show character count for note content', () => {
      // Navigate to log note page
      cy.get('[data-testid="add-visit-button"]').click();
      cy.get('[data-testid="add-option-log-note"]').click();

      // Type some content
      const content = 'Testing character count';
      cy.get('[data-testid="note-content-input"]').type(content);

      // Verify character count is displayed
      cy.contains(`${content.length}/2000`).should('be.visible');
    });

    it('should return to add visit page when clicking cancel', () => {
      // Navigate to log note page
      cy.get('[data-testid="add-visit-button"]').click();
      cy.get('[data-testid="add-option-log-note"]').click();

      // Click cancel
      cy.contains('button', 'Cancel').click();

      // Should be back on add visit page
      cy.url().should('include', '/add-visit');
    });
  });

  describe('Notes List', () => {
    // Create a note first for list tests
    beforeEach(() => {
      // Create a test note
      cy.get('[data-testid="add-visit-button"]').click();
      cy.get('[data-testid="add-option-log-note"]').click();
      cy.get('[data-testid="note-content-input"]').type('Test note for list view');
      cy.get('[data-testid="save-note-button"]').click();
      cy.url().should('include', '/home');
    });

    it('should show Use Saved Note option when notes exist', () => {
      // Navigate to add visit page
      cy.get('[data-testid="add-visit-button"]').click();

      // Use Saved Note option should appear
      cy.get('[data-testid="add-option-use-saved-note"]').should('be.visible');
    });

    it('should navigate to notes list from add visit menu', () => {
      // Navigate to add visit page
      cy.get('[data-testid="add-visit-button"]').click();

      // Click on Use Saved Note
      cy.get('[data-testid="add-option-use-saved-note"]').click();

      // Should show note selector dialog
      cy.contains('Select a Note').should('be.visible');
    });
  });

  describe('Edit Note', () => {
    beforeEach(() => {
      // Create a test note
      cy.get('[data-testid="add-visit-button"]').click();
      cy.get('[data-testid="add-option-log-note"]').click();
      cy.get('[data-testid="note-content-input"]').type('Note to edit');
      cy.get('[data-testid="save-note-button"]').click();
      cy.url().should('include', '/home');

      // Navigate to notes page
      cy.visit('/notes');
    });

    it('should display notes list', () => {
      // Should show notes
      cy.contains('My Notes').should('be.visible');
      cy.contains('Note to edit').should('be.visible');
    });

    it('should filter notes by status', () => {
      // Default should show unused notes
      cy.contains('Unused').should('be.visible');

      // Click All filter
      cy.contains('button', 'All').click();

      // Should still show the note
      cy.contains('Note to edit').should('be.visible');
    });

    it('should edit a note', () => {
      // Click edit button on the note
      cy.get('[data-testid^="edit-note-"]').first().click();

      // Should be on edit page
      cy.url().should('include', '/edit-note/');

      // Update content
      cy.get('[data-testid="note-content-input"]').clear().type('Updated note content');

      // Save changes
      cy.get('[data-testid="update-note-button"]').click();

      // Should redirect back to notes list
      cy.url().should('include', '/notes');

      // Updated content should be visible
      cy.contains('Updated note content').should('be.visible');
    });

    it('should delete a note', () => {
      // Click delete button on the note
      cy.get('[data-testid^="delete-note-"]').first().click();

      // Confirm deletion dialog
      cy.contains('Delete Note').should('be.visible');
      cy.contains('button', 'Delete').click();

      // Note should be gone
      cy.contains('Note to edit').should('not.exist');
    });
  });

  describe('Use Note Flow', () => {
    beforeEach(() => {
      // Create a test note
      cy.get('[data-testid="add-visit-button"]').click();
      cy.get('[data-testid="add-option-log-note"]').click();
      cy.get('[data-testid="note-content-input"]').type('Note for quick track');
      cy.get('[data-testid="note-location-input"]').type('Test Location');
      cy.get('[data-testid="save-note-button"]').click();
      cy.url().should('include', '/home');
    });

    it('should use note for quick track', () => {
      // Navigate to add visit
      cy.get('[data-testid="add-visit-button"]').click();

      // Click on Use Saved Note
      cy.get('[data-testid="add-option-use-saved-note"]').click();

      // Select the note
      cy.get('[data-testid^="select-note-"]').first().click();

      // Choose Quick Track
      cy.get('[data-testid="use-note-for-quick-track"]').click();

      // Should be on quick track page
      cy.url().should('include', '/quick-track');

      // Note content should be pre-filled in notes field
      cy.get('#notes').should('contain.value', 'Note for quick track');

      // Location should be pre-filled
      cy.get('#location').should('have.value', 'Test Location');
    });

    it('should use note for restaurant visit', () => {
      // Navigate to add visit
      cy.get('[data-testid="add-visit-button"]').click();

      // Click on Use Saved Note
      cy.get('[data-testid="add-option-use-saved-note"]').click();

      // Select the note
      cy.get('[data-testid^="select-note-"]').first().click();

      // Choose Restaurant Visit
      cy.get('[data-testid="use-note-for-visit"]').click();

      // Should be on restaurant selection page
      cy.url().should('include', '/add-visit/select-restaurant');
    });
  });
});
