package migrations

import (
	"log"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const friendshipsUniquePairIndex = "CREATE UNIQUE INDEX idx_friendships_user_friend_pair ON friendships (CASE WHEN user < friend THEN user ELSE friend END, CASE WHEN user < friend THEN friend ELSE user END)"

func init() {
	m.Register(func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("friendships")
		if err != nil {
			return err
		}

		// Keep one canonical row per unordered user pair before adding the unique index.
		if _, err := app.DB().NewQuery(`
			DELETE FROM friendships
			WHERE id IN (
				SELECT id
				FROM (
					SELECT
						id,
						ROW_NUMBER() OVER (
							PARTITION BY
								CASE WHEN user < friend THEN user ELSE friend END,
								CASE WHEN user < friend THEN friend ELSE user END
							ORDER BY
								CASE status
									WHEN 'accepted' THEN 1
									WHEN 'pending' THEN 2
									WHEN 'blocked' THEN 3
									ELSE 4
								END,
								created ASC,
								id ASC
						) AS row_num
					FROM friendships
				)
				WHERE row_num > 1
			)
		`).Execute(); err != nil {
			return err
		}

		collection.CreateRule = types.Pointer("@request.auth.id != '' && user = @request.auth.id && friend != @request.auth.id && status = 'pending'")
		collection.UpdateRule = types.Pointer("friend = @request.auth.id")

		if !hasCollectionIndex(collection.Indexes, friendshipsUniquePairIndex) {
			collection.Indexes = append(collection.Indexes, friendshipsUniquePairIndex)
		}

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Tightened friendship create rules and added unique pair index")
		return nil
	}, func(app core.App) error {
		collection, err := app.FindCollectionByNameOrId("friendships")
		if err != nil {
			return err
		}

		collection.CreateRule = types.Pointer("@request.auth.id != ''")
		collection.UpdateRule = types.Pointer("friend = @request.auth.id")
		collection.Indexes = removeCollectionIndex(collection.Indexes, friendshipsUniquePairIndex)

		if err := app.Save(collection); err != nil {
			return err
		}

		log.Println("✓ Restored legacy friendship create rules")
		return nil
	})
}
