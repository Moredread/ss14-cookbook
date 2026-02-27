import { Recipe } from '../../types';

export type RelationDirection = 'upstream' | 'downstream';

export const getUpstreamRecipes = (
  recipe: Recipe,
  recipesBySolidResult: ReadonlyMap<string, readonly string[]>,
  recipesByReagentResult: ReadonlyMap<string, readonly string[]>,
): string[] => {
  const result: string[] = [];
  for (const id of Object.keys(recipe.solids)) {
    const recipes = recipesBySolidResult.get(id);
    if (recipes) {
      result.push(...recipes);
    }
  }
  for (const id of Object.keys(recipe.reagents)) {
    const recipes = recipesByReagentResult.get(id);
    if (recipes) {
      result.push(...recipes);
    }
  }
  return result;
};

export const getDownstreamRecipes = (
  recipe: Recipe,
  recipesBySolidIngredient: ReadonlyMap<string, readonly string[]>,
  recipesByReagentIngredient: ReadonlyMap<string, readonly string[]>,
): string[] => {
  let recipes: readonly string[] | undefined;
  if (recipe.solidResult) {
    recipes = recipesBySolidIngredient.get(recipe.solidResult);
  } else if (recipe.reagentResult) {
    recipes = recipesByReagentIngredient.get(recipe.reagentResult);
  }
  return recipes ? recipes.slice() : [];
};
