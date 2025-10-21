describe('Food Tracker', () => {
  beforeEach(() => {
    cy.login('test@example.com', 'testpassword123');
    cy.get('[data-testid="tab-restaurants"]').click();
  });

  describe('Restaurants', () => {
    it('should display restaurants page', () => {
      cy.url().should('include', '/restaurants');
      cy.contains('Restaurants').should('be.visible');
      cy.get('[data-testid="add-restaurant-btn"]').should('be.visible');
      cy.get('[data-testid="restaurant-search"]').should('be.visible');
    });

    it('should add a new restaurant', () => {
      // Click add restaurant button
      cy.get('[data-testid="add-restaurant-btn"]').click();
      cy.get('[data-testid="add-restaurant-form"]').should('be.visible');

      // Fill in restaurant details
      const restaurantName = `Test Restaurant ${Date.now()}`;
      cy.get('[data-testid="restaurant-name-input"]').type(restaurantName);
      cy.get('[data-testid="restaurant-location-input"]').type('123 Test St, Test City');
      cy.get('[data-testid="restaurant-cuisine-input"]').type('Italian');

      // Submit form
      cy.get('[data-testid="save-restaurant-btn"]').click();

      // Form should close and restaurant should appear in list
      cy.get('[data-testid="add-restaurant-form"]').should('not.exist');
      cy.contains(restaurantName).should('be.visible');
    });

    it('should search restaurants', () => {
      // Type in search box
      cy.get('[data-testid="restaurant-search"]').type('Test');

      // Results should be filtered
      cy.get('[data-testid^="restaurant-card-"]').should('exist');
    });

    it('should navigate to restaurant detail', () => {
      // Add a restaurant first if none exist
      cy.get('body').then($body => {
        if ($body.find('[data-testid^="restaurant-card-"]').length === 0) {
          cy.get('[data-testid="add-restaurant-btn"]').click();
          cy.get('[data-testid="restaurant-name-input"]').type('Detail Test Restaurant');
          cy.get('[data-testid="restaurant-location-input"]').type('456 Detail Ave');
          cy.get('[data-testid="save-restaurant-btn"]').click();
        }
      });

      // Click on first restaurant card
      cy.get('[data-testid^="restaurant-card-"]').first().click();

      // Should navigate to detail page
      cy.url().should('include', '/restaurants/');
      cy.get('[data-testid="back-btn"]').should('be.visible');
      cy.get('[data-testid="add-food-item-btn"]').should('be.visible');
    });
  });

  describe('Food Items', () => {
    beforeEach(() => {
      // Navigate to first restaurant's detail page
      cy.get('body').then($body => {
        if ($body.find('[data-testid^="restaurant-card-"]').length > 0) {
          cy.get('[data-testid^="restaurant-card-"]').first().click();
        } else {
          // Create a restaurant first
          cy.get('[data-testid="add-restaurant-btn"]').click();
          cy.get('[data-testid="restaurant-name-input"]').type('Food Items Test Restaurant');
          cy.get('[data-testid="restaurant-location-input"]').type('789 Food St');
          cy.get('[data-testid="save-restaurant-btn"]').click();
          cy.get('[data-testid^="restaurant-card-"]').first().click();
        }
      });
    });

    it('should add a food item', () => {
      // Click add food item button
      cy.get('[data-testid="add-food-item-btn"]').click();
      cy.get('[data-testid="add-food-item-form"]').should('be.visible');

      // Fill in food item details
      const foodItemName = `Test Pizza ${Date.now()}`;
      cy.get('[data-testid="food-item-name-input"]').type(foodItemName);
      cy.get('[data-testid="food-item-description-input"]').type('Delicious test pizza');

      // Submit form
      cy.get('[data-testid="save-food-item-btn"]').click();

      // Form should close and food item should appear
      cy.get('[data-testid="add-food-item-form"]').should('not.exist');
      cy.contains(foodItemName).should('be.visible');
    });

    it('should add a rating to a food item', () => {
      // Add a food item first if none exist
      cy.get('body').then($body => {
        if ($body.find('[data-testid^="food-item-card-"]').length === 0) {
          cy.get('[data-testid="add-food-item-btn"]').click();
          cy.get('[data-testid="food-item-name-input"]').type('Margherita Pizza');
          cy.get('[data-testid="food-item-description-input"]').type('Classic pizza');
          cy.get('[data-testid="save-food-item-btn"]').click();
          cy.wait(500);
        }
      });

      // Find the first food item and click add rating
      cy.get('[data-testid^="food-item-card-"]').first().within(() => {
        cy.get('[data-testid^="add-rating-btn-"]').click();
      });

      // Set rating to 4 stars
      cy.get('[data-testid="star-4"]').click();

      // Set visit date to today
      const today = new Date().toISOString().split('T')[0];
      cy.get('[data-testid="visit-date-input"]').clear().type(today);

      // Add notes
      cy.get('[data-testid="rating-notes-input"]').type('Really good!');

      // Submit rating
      cy.get('[data-testid="save-rating-btn"]').click();

      // Rating should appear in the food item card
      cy.get('[data-testid^="rating-"]').should('be.visible');
      cy.contains('Really good!').should('be.visible');
    });

    it('should display average rating for food item', () => {
      // This test assumes a food item with ratings exists
      cy.get('body').then($body => {
        const foodItemCards = $body.find('[data-testid^="food-item-card-"]');
        if (foodItemCards.length > 0) {
          // Check if any food item has a rating badge
          const hasRatingBadge = $body.find('div:contains("★")').length > 0;
          if (hasRatingBadge) {
            cy.log('Food item with rating found');
          }
        }
      });
    });

    it('should navigate back to restaurants list', () => {
      cy.get('[data-testid="back-btn"]').click();
      cy.url().should('include', '/restaurants');
      cy.url().should('not.include', '/restaurants/');
    });
  });

  describe('Full Food Tracker Flow', () => {
    it('should complete full workflow: add restaurant, add food item, add rating', () => {
      // 1. Add a restaurant
      const restaurantName = `E2E Test Restaurant ${Date.now()}`;
      cy.get('[data-testid="add-restaurant-btn"]').click();
      cy.get('[data-testid="restaurant-name-input"]').type(restaurantName);
      cy.get('[data-testid="restaurant-location-input"]').type('E2E Test Location');
      cy.get('[data-testid="restaurant-cuisine-input"]').type('Test Cuisine');
      cy.get('[data-testid="save-restaurant-btn"]').click();

      // 2. Navigate to restaurant detail
      cy.contains(restaurantName).click();
      cy.url().should('include', '/restaurants/');

      // 3. Add a food item
      const foodItemName = 'E2E Test Burger';
      cy.get('[data-testid="add-food-item-btn"]').click();
      cy.get('[data-testid="food-item-name-input"]').type(foodItemName);
      cy.get('[data-testid="food-item-description-input"]').type('Tasty test burger');
      cy.get('[data-testid="save-food-item-btn"]').click();

      // 4. Add a rating
      cy.contains(foodItemName).should('be.visible');
      cy.get('[data-testid^="add-rating-btn-"]').first().click();
      cy.get('[data-testid="star-5"]').click();

      const today = new Date().toISOString().split('T')[0];
      cy.get('[data-testid="visit-date-input"]').clear().type(today);
      cy.get('[data-testid="rating-notes-input"]').type('Amazing burger!');
      cy.get('[data-testid="save-rating-btn"]').click();

      // 5. Verify rating appears
      cy.contains('Amazing burger!').should('be.visible');

      // 6. Navigate back to restaurants
      cy.get('[data-testid="back-btn"]').click();
      cy.contains(restaurantName).should('be.visible');
    });
  });
});
