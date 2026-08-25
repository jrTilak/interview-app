# `@interview-desk/validations`

Shared validation constraints and composable Zod schemas for Interview Desk.

```ts
import {
	createUpdateSchema,
	DESCRIPTION_LENGTH,
	DescriptionSchema,
	UuidSchema,
} from "@interview-desk/validations";
import { z } from "zod";

const OptionalDescriptionSchema = DescriptionSchema.optional();
const CreateResourceSchema = z.object({ description: DescriptionSchema });
const UpdateResourceSchema = createUpdateSchema(CreateResourceSchema);
```

Zod is included as a package dependency.
