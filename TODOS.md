# FEATURE TODOS (Existing)

- maybe in scanning menu for items, double check if the restaurant name corresponds to the restaurant selected, and then if there's discrepancy, alert the user to let them know what they want to do (i.e. still proceed with the menu or cancel it)
- ability to see people's average scores according to all their records
    - ability to see people's average score according to food and restaurant type
    - in friends tab, it will show the average score for the user
    - there will be a cron job that happens every month where it sends the data up to gemini to generate some scores according to their ratings that will be public for them and their friends, and friends can view these since it will be historical
    - (paid feature) users can view their and their friend's current up to date ratings if they want to and it will only show for them (analyzed up to the current date)
    - (paid feature) users can view their own rating analysis according to month/year
    - have a compatibility score from user to their friends
- friend leaderboard
- restaurant lists
    - create some suggested places to go to with friends that have "bookmarked" the same restaurant
    - have an exploratory map, similar to google maps, that provides information that can be collected from google, and allow user to bookmark to their lists (have a default list people can add to, but then also make it easy to transfer that place to another list)
- add a map view to the home page
    - allow for user to toggle their own locations as well as their own friends
    - add a "toggleable bottom tray" that shows up with the list of visits records

- add a way for the user to toggle a notification to be sent to the user to either process the note afterwards or to just generally notify the user to track what they just ate
- when a user is selecting restaurants, currently, they will select a specific google maps location or restaurant they created. what happens when the user goes to a "chain" or similar restaurant names" to view what they ordered? how do we showcase this to the user?
  - right now, when a user searches for a restaurant, we can see if they or their friendsbe a "group rating session", where the user can create a ephemeral group where the user sets up the restaurants + menu items the group is going to rate (i.e. hangout where someone buys 10 teas from 10 stores to try out), and then there's a code that someone can provide. then users on the app can enter that code in and then it will prepopulate the restaurants + menu items in the order the creator made.  went to the place, but not what they ordered, can we think of a way to showcase what the user or their friends ordered?
  - in the food product item, there's also no way to see if a user has already eaten that item before
  - in the process saved photos, there's also no way for the user to see if they or their friends have been to the same restaurant before, can we think of a way to showcase what the user or their friends ordered before?

- add better one click registration options (currently, the verification email sent by Resend is super slow and it's causing a lot of people I ask to use the app to stop prematurely)
